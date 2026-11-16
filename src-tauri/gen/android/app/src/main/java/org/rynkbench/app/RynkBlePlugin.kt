package org.rynkbench.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Base64
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.ArrayDeque
import java.util.UUID

/**
 * The Android half of the Rynk BLE transport (`src-tauri/src/ble_android.rs`).
 *
 * Android exposes its BLE stack only through the Java API, so the GATT work
 * lives here: one link at a time, opened by address, with the input
 * characteristic's notifications forwarded up a channel and outbound frames
 * chunked to the negotiated MTU.
 *
 * Discovery lists *bonded* devices instead of scanning. The firmware's host
 * advertisement never carries the Rynk service UUID, and a keyboard busy being
 * a keyboard is not advertising at all — but a bonded device can be reached by
 * address either way. That also keeps this to the BLUETOOTH_CONNECT
 * permission: scanning is what would drag in BLUETOOTH_SCAN and location.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetooth"),
        Permission(
            strings = [Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN],
            alias = "bluetoothLegacy",
        ),
    ]
)
class RynkBlePlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        // Source of truth: `rmk_types::protocol::rynk` in the pinned rmk fork.
        val SERVICE_UUID: UUID = UUID.fromString("10900067-537f-4f0a-9b55-929e271f61ab")
        val INPUT_CHAR_UUID: UUID = UUID.fromString("80f9319b-0c74-43a5-9738-c59d6dda3db9")
        val OUTPUT_CHAR_UUID: UUID = UUID.fromString("19802524-6f90-4346-93c2-63dbc509ab55")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        /** What the firmware chunks its notifications to; the ceiling for writes too. */
        const val RYNK_CHUNK_SIZE = 244
        /** ATT-minimum payload, the floor before an MTU is negotiated. */
        const val SAFE_WRITE = 20
        const val WANTED_MTU = RYNK_CHUNK_SIZE + 3
    }

    // GATT callbacks arrive on a binder thread while commands arrive on
    // Tauri's, so the link state is volatile and every transition that touches
    // more than one of these fields is @Synchronized.
    @Volatile private var gatt: BluetoothGatt? = null
    @Volatile private var output: BluetoothGattCharacteristic? = null
    @Volatile private var input: BluetoothGattCharacteristic? = null
    @Volatile private var channel: Channel? = null
    /** Resolved once notifications are live, or rejected once, never both. */
    @Volatile private var opening: Invoke? = null
    @Volatile private var writeChunk = SAFE_WRITE
    private var pendingOpen: OpenParams? = null

    /** Android runs one GATT operation at a time; writes queue behind each other. */
    private val writeLock = Any()
    private val writes: ArrayDeque<ByteArray> = ArrayDeque()
    private var writing = false

    @InvokeArg
    class OpenParams {
        val address: String? = null
        var channel: Channel? = null
    }

    @InvokeArg
    class SendParams {
        val data: String = ""
    }

    private fun manager(): BluetoothManager? =
        activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?

    private fun hasPermission(): Boolean {
        val alias =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "bluetoothLegacy"
        return getPermissionState(alias) == PermissionState.GRANTED
    }

    private fun requestPermission(invoke: Invoke, callback: String) {
        val alias =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "bluetoothLegacy"
        requestPermissionForAlias(alias, invoke, callback)
    }

    /**
     * Bonded LE devices, most likely first: a device the platform already has a
     * GATT link to is both reachable and cheap to attach to. Which candidate is
     * actually a Rynk peer is settled by the handshake, not here — the Rynk
     * service is only visible after connecting.
     */
    @Command
    fun list(invoke: Invoke) {
        if (!hasPermission()) {
            requestPermission(invoke, "listPermissionCallback")
            return
        }
        resolveList(invoke)
    }

    @PermissionCallback
    fun listPermissionCallback(invoke: Invoke) {
        if (!hasPermission()) {
            invoke.reject("Rynkbench needs the Nearby devices permission to reach the keyboard")
            return
        }
        resolveList(invoke)
    }

    @SuppressLint("MissingPermission")
    private fun resolveList(invoke: Invoke) {
        val manager = manager()
        val adapter = manager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            invoke.reject("Bluetooth is off")
            return
        }
        val connected = manager.getConnectedDevices(BluetoothProfile.GATT).map { it.address }.toSet()
        val devices =
            adapter.bondedDevices
                .filter {
                    it.type == BluetoothDevice.DEVICE_TYPE_LE ||
                        it.type == BluetoothDevice.DEVICE_TYPE_DUAL
                }
                .sortedByDescending { connected.contains(it.address) }
                .map {
                    val entry = JSObject()
                    entry.put("id", it.address)
                    entry.put("label", it.name ?: "Rynk (Bluetooth)")
                    entry
                }
        val result = JSObject()
        result.put("devices", JSArray(devices))
        invoke.resolve(result)
    }

    /**
     * Attach to one bonded device and stay attached until [close]. Resolves only
     * once the input subscription is live, so no notification can be dropped
     * between the open returning and the caller listening.
     */
    @Command
    fun open(invoke: Invoke) {
        val args = invoke.parseArgs(OpenParams::class.java)
        if (!hasPermission()) {
            pendingOpen = args
            requestPermission(invoke, "openPermissionCallback")
            return
        }
        startOpen(invoke, args)
    }

    @PermissionCallback
    fun openPermissionCallback(invoke: Invoke) {
        val args = pendingOpen
        pendingOpen = null
        if (!hasPermission() || args == null) {
            invoke.reject("Rynkbench needs the Nearby devices permission to reach the keyboard")
            return
        }
        startOpen(invoke, args)
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    private fun startOpen(invoke: Invoke, args: OpenParams) {
        val adapter = manager()?.adapter
        if (adapter == null || !adapter.isEnabled) {
            invoke.reject("Bluetooth is off")
            return
        }
        val address = args.address
        val device =
            try {
                if (address != null) {
                    adapter.getRemoteDevice(address)
                } else {
                    adapter.bondedDevices.firstOrNull {
                        it.type == BluetoothDevice.DEVICE_TYPE_LE ||
                            it.type == BluetoothDevice.DEVICE_TYPE_DUAL
                    }
                }
            } catch (error: IllegalArgumentException) {
                null
            }
        if (device == null) {
            invoke.reject(
                if (address != null) "Bluetooth device $address is not known to this phone"
                else "No bonded Bluetooth keyboard found"
            )
            return
        }

        // A second open replaces the first, matching the desktop backend.
        teardown(notify = false)
        channel = args.channel
        opening = invoke
        writeChunk = SAFE_WRITE
        gatt = device.connectGatt(activity, false, callback, BluetoothDevice.TRANSPORT_LE)
        if (gatt == null) {
            opening = null
            channel = null
            invoke.reject("Could not open a GATT connection to ${device.name ?: address}")
        }
    }

    @Command
    fun send(invoke: Invoke) {
        val args = invoke.parseArgs(SendParams::class.java)
        val characteristic = output
        if (gatt == null || characteristic == null) {
            invoke.reject("No Bluetooth device open")
            return
        }
        val bytes = Base64.decode(args.data, Base64.NO_WRAP)
        synchronized(writeLock) {
            var offset = 0
            while (offset < bytes.size) {
                val end = minOf(offset + writeChunk, bytes.size)
                writes.add(bytes.copyOfRange(offset, end))
                offset = end
            }
        }
        pumpWrites()
        invoke.resolve()
    }

    @Command
    fun close(invoke: Invoke) {
        teardown(notify = false)
        invoke.resolve()
    }

    /**
     * Write-without-response still completes through `onCharacteristicWrite`,
     * and a second write before that callback is simply refused — so frames go
     * out one chunk at a time, in order.
     */
    @SuppressLint("MissingPermission")
    private fun pumpWrites() {
        val chunk: ByteArray
        synchronized(writeLock) {
            if (writing) return
            chunk = writes.poll() ?: return
            writing = true
        }
        val gatt = this.gatt
        val characteristic = output
        if (gatt == null || characteristic == null) {
            synchronized(writeLock) {
                writing = false
                writes.clear()
            }
            return
        }
        val ok =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeCharacteristic(
                    characteristic,
                    chunk,
                    BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE,
                ) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                @Suppress("DEPRECATION")
                characteristic.value = chunk
                @Suppress("DEPRECATION")
                gatt.writeCharacteristic(characteristic)
            }
        if (!ok) {
            synchronized(writeLock) {
                writing = false
                writes.clear()
            }
            teardown(notify = true)
        }
    }

    private fun finishWrite() {
        synchronized(writeLock) { writing = false }
        pumpWrites()
    }

    private fun sendEvent(event: JSObject) {
        channel?.send(event)
    }

    private fun emitChunk(value: ByteArray) {
        val event = JSObject()
        event.put("event", "chunk")
        event.put("data", Base64.encodeToString(value, Base64.NO_WRAP))
        sendEvent(event)
    }

    /** Fails a half-finished open, or reports the death of a live link — never both. */
    @SuppressLint("MissingPermission")
    @Synchronized
    private fun teardown(notify: Boolean, reason: String? = null) {
        val pending = opening
        opening = null
        val hadChannel = channel
        synchronized(writeLock) {
            writes.clear()
            writing = false
        }
        input = null
        output = null
        gatt?.let {
            it.disconnect()
            it.close()
        }
        gatt = null
        channel = null
        if (pending != null) {
            pending.reject(reason ?: "The Bluetooth link closed before it was ready")
            return
        }
        if (notify && hadChannel != null) {
            val event = JSObject()
            event.put("event", "disconnect")
            hadChannel.send(event)
        }
    }

    private val callback =
        object : BluetoothGattCallback() {
            @SuppressLint("MissingPermission")
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (g !== gatt) {
                    g.close()
                    return
                }
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    if (!g.discoverServices()) {
                        teardown(notify = true, reason = "GATT service discovery would not start")
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    teardown(
                        notify = true,
                        reason = "Could not connect to the keyboard (GATT status $status)",
                    )
                }
            }

            @SuppressLint("MissingPermission")
            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                if (g !== gatt) return
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    teardown(notify = true, reason = "GATT service discovery failed ($status)")
                    return
                }
                val service = g.getService(SERVICE_UUID)
                if (service == null) {
                    teardown(notify = true, reason = "Rynk GATT service not found on this device")
                    return
                }
                input = service.getCharacteristic(INPUT_CHAR_UUID)
                output = service.getCharacteristic(OUTPUT_CHAR_UUID)
                if (input == null || output == null) {
                    teardown(notify = true, reason = "Rynk GATT characteristics missing")
                    return
                }
                // Subscribing is also what makes the platform encrypt the link:
                // both characteristics are encrypted-only, so an unbonded device
                // pairs here rather than failing.
                if (!g.requestMtu(WANTED_MTU)) subscribe()
            }

            override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
                if (g !== gatt) return
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    writeChunk = (mtu - 3).coerceIn(SAFE_WRITE, RYNK_CHUNK_SIZE)
                }
                subscribe()
            }

            override fun onDescriptorWrite(
                g: BluetoothGatt,
                descriptor: BluetoothGattDescriptor,
                status: Int,
            ) {
                if (g !== gatt || descriptor.uuid != CCCD_UUID) return
                val pending = opening
                opening = null
                if (pending == null) return
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    // Put it back so teardown reports the failure to the caller.
                    opening = pending
                    teardown(
                        notify = true,
                        reason = "Could not subscribe to Rynk input ($status)",
                    )
                    return
                }
                val result = JSObject()
                @Suppress("DEPRECATION")
                result.put("label", g.device.name ?: g.device.address)
                pending.resolve(result)
            }

            /** Pre-Tiramisu notifications; the value rides on the characteristic. */
            @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
            override fun onCharacteristicChanged(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
            ) {
                if (g !== gatt || characteristic.uuid != INPUT_CHAR_UUID) return
                emitChunk(characteristic.value ?: return)
            }

            override fun onCharacteristicChanged(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray,
            ) {
                if (g !== gatt || characteristic.uuid != INPUT_CHAR_UUID) return
                emitChunk(value)
            }

            override fun onCharacteristicWrite(
                g: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int,
            ) {
                if (g !== gatt) return
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    teardown(notify = true, reason = "Rynk write failed ($status)")
                    return
                }
                finishWrite()
            }
        }

    @SuppressLint("MissingPermission")
    @Synchronized
    private fun subscribe() {
        val g = gatt
        val characteristic = input
        if (g == null || characteristic == null) {
            teardown(notify = true, reason = "The Bluetooth link closed before it was ready")
            return
        }
        if (!g.setCharacteristicNotification(characteristic, true)) {
            teardown(notify = true, reason = "Could not enable Rynk notifications")
            return
        }
        val cccd = characteristic.getDescriptor(CCCD_UUID)
        if (cccd == null) {
            teardown(notify = true, reason = "Rynk input characteristic cannot notify")
            return
        }
        val ok =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ==
                    BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
        if (!ok) teardown(notify = true, reason = "Could not subscribe to Rynk input")
    }
}
