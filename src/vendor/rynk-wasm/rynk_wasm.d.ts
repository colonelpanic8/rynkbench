/* tslint:disable */
/* eslint-disable */
/**
 * A KeyAction is the action at a keyboard position, stored in keymap.
 * It can be a single action like triggering a key, or a composite keyboard action like tap/hold
 */
export type KeyAction = "No" | "Transparent" | { Single: Action } | { Tap: Action } | { TapHold: [Action, Action, number] } | { Morse: number };

/**
 * A decoded topic push (server → host), one variant per row of the
 * topic table above — generated from it. `Serialize` lets the host
 * re-emit a decoded topic as JSON (every payload is already a wire type).
 */
export type TopicEvent = { LayerChange: number } | { WpmUpdate: number } | { ConnectionChange: ConnectionStatus } | { SleepState: boolean } | { LedIndicatorChange: LedIndicator } | { BatteryStatusChange: BatteryStatus } | { LightingChange: LightingChanged };

/**
 * A key\'s outline rectangle in key-units.
 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * A single basic action that a keyboard can execute.
 */
export type Action = "No" | { Key: KeyCode } | { Modifier: ModifierCombination } | { KeyWithModifier: [HidKeyCode, ModifierCombination] } | { LayerOn: number } | { LayerOnWithModifier: [number, ModifierCombination] } | { LayerOff: number } | { LayerToggle: number } | { DefaultLayer: number } | { LayerToggleOnly: number } | "TriLayerLower" | "TriLayerUpper" | { TriggerMacro: number } | { OneShotLayer: number } | { OneShotModifier: ModifierCombination } | { OneShotKey: HidKeyCode } | { Light: LightAction } | { KeyboardControl: KeyboardAction } | { Special: SpecialKey } | { User: number } | { PersistentDefaultLayer: number } | { Steno: StenoKey };

/**
 * A single steno key, identified by its position (0..=63) in the canonical
 * Plover HID key chart. See module docs for the full list.
 */
export type StenoKey = number;

/**
 * Action for a rotary encoder position, stored in the encoder map.
 *
 * Both fields default to `KeyAction::No` (no action).
 */
export interface EncoderAction {
    /**
     * Action triggered when the encoder is rotated clockwise.
     */
    clockwise: KeyAction;
    /**
     * Action triggered when the encoder is rotated counter-clockwise.
     */
    counter_clockwise: KeyAction;
}

/**
 * Actions for controlling lights
 */
export type LightAction = "BacklightOn" | "BacklightOff" | "BacklightToggle" | "BacklightDown" | "BacklightUp" | "BacklightStep" | "BacklightToggleBreathing" | "RgbTog" | "RgbModeForward" | "RgbModeReverse" | "RgbHui" | "RgbHud" | "RgbSai" | "RgbSad" | "RgbVai" | "RgbVad" | "RgbSpi" | "RgbSpd" | "RgbModePlain" | "RgbModeBreathe" | "RgbModeRainbow" | "RgbModeSwirl" | "RgbModeSnake" | "RgbModeKnight" | "RgbModeXmas" | "RgbModeGradient" | "RgbModeRgbtest" | "RgbModeTwinkle";

/**
 * Actions for controlling the keyboard or changing the keyboard\'s state, for example, enable/disable a particular function
 */
export type KeyboardAction = "Bootloader" | "Reboot" | "DebugToggle" | "ClearEeprom" | "OutputAuto" | "OutputUsb" | "OutputBluetooth" | "ComboOn" | "ComboOff" | "ComboToggle" | "CapsWordToggle";

/**
 * BLE state (what the BLE subsystem is currently doing).
 */
export type BleState = "Advertising" | "Connected" | "Inactive";

/**
 * Battery status used for both status queries and event notifications.
 */
export type BatteryStatus = "Unavailable" | { Available: { charge_state: ChargeState; level: number | undefined } };

/**
 * Bitset state used by fork matching logic.
 *
 * A zero (default) value means \"match nothing\" — no modifiers, LEDs, or mouse buttons.
 */
export interface StateBits {
    /**
     * Active modifier combination to match.
     */
    modifiers: ModifierCombination;
    /**
     * LED indicator state to match (Num/Caps/Scroll Lock, etc.).
     */
    leds: LedIndicator;
    /**
     * Mouse button state to match.
     */
    mouse: MouseButtons;
}

/**
 * Bulk request payload for `SetComboBulk`: write `configs` starting at slot
 * `start_index`.
 */
export interface SetComboBulkRequest {
    start_index: number;
    configs: Combo[];
}

/**
 * Bulk request payload for `SetMorseBulk`: write `configs` starting at slot
 * `start_index`.
 */
export interface SetMorseBulkRequest {
    start_index: number;
    configs: Morse[];
}

/**
 * Bulk response for getting multiple combos at once.
 */
export interface GetComboBulkResponse {
    configs: Combo[];
}

/**
 * Bulk response for getting multiple key actions at once.
 */
export interface GetKeymapBulkResponse {
    actions: KeyAction[];
}

/**
 * Bulk response for getting multiple morse configs at once.
 */
export interface GetMorseBulkResponse {
    configs: Morse[];
}

/**
 * Charge state of the battery.
 */
export type ChargeState = "Charging" | "Discharging" | "Unknown";

/**
 * Configuration data for a combo.
 *
 * A combo triggers an output action when a set of keys are pressed simultaneously.
 * The maximum number of trigger keys is determined by `COMBO_SIZE` (from `constants.rs`,
 * generated at build time from `keyboard.toml` on firmware or fixed upper bound on host).
 * Actions are stored in a Vec — only meaningful keys are present (no `KeyAction::No` padding).
 *
 * Note: `COMBO_SIZE` is a **wire-format** capacity — on firmware it equals
 * `COMBO_MAX_LENGTH` (from `keyboard.toml`), on host it\'s a fixed upper bound.
 */
export interface Combo {
    actions: KeyAction[];
    output: KeyAction;
    layer: number | undefined;
}

/**
 * Connection type for the keyboard.
 */
export type ConnectionType = "Usb" | "Ble";

/**
 * Current lock/unlock state of this Rynk session, returned by `GetLockStatus`
 * and `UnlockPoll`. The `Lock` endpoint returns `()`.
 *
 * Loses `Copy` and derived `MaxSize` (both forbidden by the `heapless::Vec`
 * field): handlers return it by value, and the bound is hand-written below.
 */
export interface LockStatus {
    locked: boolean;
    /**
     * An unlock attempt is armed (host is polling; window not yet lapsed).
     */
    unlocking: boolean;
    /**
     * Challenge keys not currently held; `== key_positions.len()` when no
     * attempt is armed.
     */
    remaining_keys: number;
    /**
     * The challenge itself: physical `(row, col)` the user must hold. Empty
     * while `locked` ⇒ permanently locked (no `unlock_keys` configured).
     */
    key_positions: [number, number][];
}

/**
 * Current matrix key-press state as a bitmap.
 * Bit ordering: row-major, bit 0 = col 0, bit 1 = col 1, etc.
 * Total meaningful bytes = num_rows * ceil(num_cols / 8).
 */
export interface MatrixState {
    pressed_bitmap: number[];
}

/**
 * Definition of a morse key.
 *
 * A morse key is a key that behaves differently according to the pattern of a tap/hold sequence.
 * The maximum number of taps is limited to 15 by the internal u16 representation of MorsePattern.
 * There is a list of (pattern, corresponding action) pairs for each morse key:
 * The number of pairs is limited by `MORSE_SIZE` (from `constants.rs`, generated at build time).
 *
 * Note: `MORSE_SIZE` is a **wire-format** capacity — on firmware it equals
 * `MAX_PATTERNS_PER_KEY` (from `keyboard.toml`), on host it\'s a fixed upper bound.
 */
export interface Morse {
    /**
     * The profile of this morse key, which defines the timing parameters, etc.
     * If some of its fields are filled with None, the global default value will be used.
     */
    profile: MorseProfile;
    /**
     * The list of pattern -> action pairs, which can be triggered
     */
    actions: [number, Action][];
}

/**
 * Device capabilities discovered during the connection handshake.
 *
 * The host reads this once after connecting to learn the firmware\'s layout,
 * feature set, and protocol limits.
 */
export interface DeviceCapabilities {
    num_layers: number;
    num_rows: number;
    num_cols: number;
    num_encoders: number;
    max_combos: number;
    max_combo_keys: number;
    /**
     * Byte size of the flat macro region. `0` disables macro data endpoints.
     */
    macro_space_size: number;
    max_morse: number;
    max_patterns_per_key: number;
    max_forks: number;
    storage_enabled: boolean;
    lighting_enabled: boolean;
    is_split: boolean;
    num_split_peripherals: number;
    ble_enabled: boolean;
    num_ble_profiles: number;
    max_payload_size: number;
    /**
     * Keys per `GetKeymapBulk`/`SetKeymapBulk` message.
     */
    max_bulk_keys: number;
    /**
     * Combos or morses per bulk message. Separate from `max_bulk_keys` because
     * config items are far larger than keys, so they chunk in smaller runs.
     */
    max_bulk_configs: number;
    macro_chunk_size: number;
    bulk_transfer_supported: boolean;
}

/**
 * Device identity for display and per-device host profiles.
 *
 * Complements [`DeviceCapabilities`]: capabilities answer \"what can you do\
 * for feature gating, identity answers \"which device is this\".
 */
export interface DeviceInfo {
    rmk_version: FirmwareVersion;
    vendor_id: number;
    product_id: number;
    manufacturer: string;
    product_name: string;
    serial_number: string;
}

/**
 * Fork (key override) configuration.
 *
 * A fork overrides a key\'s output based on the current modifier/LED/mouse state.
 * When the trigger key is pressed, the fork checks current state against `match_any`
 * and `match_none` to decide between `positive_output` and `negative_output`.
 */
export interface Fork {
    /**
     * The key action that activates this fork. Should not be `KeyAction::Transparent`.
     */
    trigger: KeyAction;
    /**
     * Output when the state condition is NOT met.
     */
    negative_output: KeyAction;
    /**
     * Output when the state condition IS met.
     */
    positive_output: KeyAction;
    /**
     * If any of these state bits are active, the positive branch is taken.
     */
    match_any: StateBits;
    /**
     * If any of these state bits are active, the fork is suppressed.
     */
    match_none: StateBits;
    /**
     * Modifiers to keep active when the fork fires.
     */
    kept_modifiers: ModifierCombination;
    /**
     * Whether this fork can be rebound via protocol.
     * This is a firmware-enforced policy — the protocol itself does not
     * reject writes to non-bindable forks; enforcement happens in the
     * firmware\'s SetFork handler.
     */
    bindable: boolean;
}

/**
 * Identifies a specific key position in the keymap.
 */
export interface KeyPosition {
    layer: number;
    row: number;
    col: number;
}

/**
 * Key codes which are not in the HID spec, but still commonly used
 */
export type SpecialKey = "GraveEscape" | "Repeat";

/**
 * Keys in `Generic Desktop Page`, generally used for system control
 * Ref: <https://www.usb.org/sites/default/files/documents/hut1_12v2.pdf#page=26>
 */
export type SystemControlKey = "No" | "PowerDown" | "Sleep" | "WakeUp" | "Restart";

/**
 * Keys in consumer page
 * Ref: <https://www.usb.org/sites/default/files/documents/hut1_12v2.pdf#page=75>
 */
export type ConsumerKey = "No" | "SnapShot" | "BrightnessUp" | "BrightnessDown" | "Play" | "Pause" | "Record" | "FastForward" | "Rewind" | "NextTrack" | "PrevTrack" | "StopPlay" | "Eject" | "RandomPlay" | "Repeat" | "StopEject" | "PlayPause" | "Mute" | "VolumeIncrement" | "VolumeDecrement" | "Reserved" | "Email" | "Calculator" | "LocalBrowser" | "Lock" | "ControlPanel" | "Assistant" | "New" | "Open" | "Close" | "Exit" | "Maximize" | "Minimize" | "Save" | "Print" | "Properties" | "Undo" | "Copy" | "Cut" | "Paste" | "SelectAll" | "Find" | "Search" | "Home" | "Back" | "Forward" | "Stop" | "Refresh" | "Bookmarks" | "NextKeyboardLayoutSelect" | "DesktopShowAllWindows" | "AcSoftKeyLeft";

/**
 * Mode for morse key behavior
 */
export type MorseMode = "PermissiveHold" | "HoldOnOtherPress" | "Normal";

/**
 * MorsePattern is a sequence of maximum 15 taps or holds that can be encoded into an u16:
 * 0x1 when empty, then 0 for tap or 1 for hold shifted from the right
 */
export type MorsePattern = number;

/**
 * One encoder\'s placement within a variant: a fixed 1u knob, so just its
 * center — never resized, rotated, or L-shaped.
 */
export interface Encoder {
    id: number;
    x: number;
    y: number;
}

/**
 * One key\'s placement: matrix position, outline `rect` (center + size),
 * rotation, and an optional second rectangle for L-shaped keys (ISO/big-ass
 * Enter). `r` rotates the whole key, `rect2` included.
 */
export interface Key {
    row: number;
    col: number;
    rect: Rect;
    r: number;
    rect2: Rect | undefined;
}

/**
 * One named semantic zone.
 */
export interface LightingZone {
    id: LightingZoneId;
    name: string;
}

/**
 * One ordered transaction chunk. Chunks are applied only by commit.
 */
export interface PutLightingOverlayChunkRequest {
    transaction_id: number;
    offset: number;
    cells: LightingOverlayCell[];
}

/**
 * One render variant (e.g. ANSI / ISO): its own keys and encoders. A hidden key
 * reflows the tokens after it — encoders included — so each variant carries its
 * own encoder positions.
 */
export interface Variant {
    name: string;
    keys: Key[];
    encoders: Encoder[];
}

/**
 * Protocol version advertised during the connection handshake.
 */
export interface ProtocolVersion {
    major: number;
    minor: number;
}

/**
 * Protocol-facing behavior configuration (global timing settings).
 */
export interface BehaviorConfig {
    combo_timeout_ms: number;
    oneshot_timeout_ms: number;
    tap_interval_ms: number;
    tap_capslock_interval_ms: number;
}

/**
 * Protocol-level error returned in response payload.
 */
export type RynkError = "Malformed" | "NotReady" | "StorageFault" | "Internal" | "Unimplemented" | "Invalid" | "UnknownCmd" | "Locked";

/**
 * Raw macro data for a single macro chunk.
 */
export interface MacroData {
    data: number[];
}

/**
 * Request payload for `GetComboBulk`: read a page of combos starting at slot
 * `start_index`. The firmware returns as many as fit (`max_bulk_configs`),
 * fewer at the end, or an empty page once `start_index` reaches the slot count.
 */
export interface GetComboBulkRequest {
    start_index: number;
}

/**
 * Request payload for `GetEncoderAction`.
 */
export interface GetEncoderRequest {
    encoder_id: number;
    layer: number;
}

/**
 * Request payload for `GetKeymapBulk` endpoint.
 *
 * The run starts at key `(layer, start_row, start_col)` and reads forward
 * through the flat, row-major, layer-major keymap — crossing row and layer
 * boundaries freely. The firmware returns as many consecutive keys as fit
 * (`max_bulk_keys`), or fewer at the end of the keymap.
 */
export interface GetKeymapBulkRequest {
    layer: number;
    start_row: number;
    start_col: number;
}

/**
 * Request payload for `GetMacro`.
 */
export interface GetMacroRequest {
    offset: number;
}

/**
 * Request payload for `GetMorseBulk`: read a page of morses starting at slot
 * `start_index`. The firmware returns as many as fit (`max_bulk_configs`),
 * fewer at the end, or an empty page once `start_index` reaches the slot count.
 */
export interface GetMorseBulkRequest {
    start_index: number;
}

/**
 * Request payload for `SetCombo`.
 */
export interface SetComboRequest {
    index: number;
    config: Combo;
}

/**
 * Request payload for `SetEncoderAction`.
 */
export interface SetEncoderRequest {
    encoder_id: number;
    layer: number;
    action: EncoderAction;
}

/**
 * Request payload for `SetFork`.
 */
export interface SetForkRequest {
    index: number;
    config: Fork;
}

/**
 * Request payload for `SetKeyAction` endpoint.
 */
export interface SetKeyRequest {
    position: KeyPosition;
    action: KeyAction;
}

/**
 * Request payload for `SetKeymapBulk` endpoint.
 *
 * Writes `actions` into the flat, row-major, layer-major keymap starting at
 * key `(layer, start_row, start_col)`, continuing across rows and layers.
 */
export interface SetKeymapBulkRequest {
    layer: number;
    start_row: number;
    start_col: number;
    actions: KeyAction[];
}

/**
 * Request payload for `SetMacro`.
 *
 * Writes are by `offset`; chunk length carries no end-of-macro meaning, and
 * writes past the macro region are truncated by the firmware.
 */
export interface SetMacroRequest {
    offset: number;
    data: MacroData;
}

/**
 * Request payload for `SetMorse`.
 */
export interface SetMorseRequest {
    index: number;
    config: Morse;
}

/**
 * Status of a single split peripheral. Wired peripherals report
 * `connected: true` with `battery: Unavailable`.
 */
export interface PeripheralStatus {
    connected: boolean;
    battery: BatteryStatus;
}

/**
 * Storage reset mode for the `StorageReset` endpoint.
 */
export type StorageResetMode = "Full" | "LayoutOnly";

/**
 * The decoded physical layout: one entry per render variant.
 */
export interface LayoutInfo {
    default_variant: number;
    variants: Variant[];
}

/**
 * USB device lifecycle. `Suspended` is distinct from `Configured` because
 * the bus is enumerated but transmission is gated on remote wakeup — the
 * first key still needs to reach the USB writer to trigger that wakeup.
 */
export type UsbState = "Disabled" | "Enabled" | "Configured" | "Suspended";

/**
 * Unified BLE status: which profile is active and what the BLE is doing.
 */
export interface BleStatus {
    profile: number;
    state: BleState;
}

/**
 * Unified connection status: the single source of truth for transport
 * availability and routing. The active transport is derived on demand via
 * [`Self::decide_active`] from the input fields below.
 */
export interface ConnectionStatus {
    usb: UsbState;
    ble: BleStatus;
    /**
     * Tiebreaker when both transports are ready.
     */
    preferred: ConnectionType;
}

/**
 * Version of the `rmk` crate baked into the firmware, so hosts can key
 * version-specific behavior off the library release, not the user\'s app.
 */
export interface FirmwareVersion {
    major: number;
    minor: number;
    patch: number;
}

/**
 *r" Authoritative mutable state and optimistic-concurrency revision.
 */
export interface LightingState {
    revision: number;
    output_enabled: boolean;
    output_brightness: number;
    background: LightingBackgroundState;
    overlay_len: number;
}

/**
 *r" Begin an atomic, multi-packet overlay replacement.
 */
export interface BeginLightingOverlayReplaceRequest {
    expected_revision: number;
    cell_count: number;
}

/**
 *r" Best-effort invalidation marker. Hosts recover current authoritative
 *r" state with `GetLightingState`; events never carry a second state copy.
 */
export type LightingChanged = undefined;

/**
 *r" Board-global Q8.8 point in key-pitch units.
 */
export interface LightingPoint3 {
    x: number;
    y: number;
    z: number;
}

/**
 *r" Bounded set of standard effects understood by the RMK lighting engine.
 */
export type LightingEffect = { Solid: { color: LightingRgb8 } } | { Blink: { color: LightingRgb8; period_ms: number; phase_ms: number; duty: number } } | { Breathe: { color: LightingRgb8; period_ms: number; phase_ms: number; step_ms: number } };

/**
 *r" Built-in effects accepted by this firmware.
 */
export type LightingEffectFlags = number;

/**
 *r" Color and addressability capabilities of a physical output.
 */
export type LightingOutputCapabilities = number;

/**
 *r" Device-independent linear RGB sample.
 */
export interface LightingRgb8 {
    r: number;
    g: number;
    b: number;
}

/**
 *r" Identity of a lighting processor, such as one half of a split keyboard.
 */
export type LightingNodeId = number;

/**
 *r" Identity of one physical output owned by a lighting node.
 */
export type LightingOutputId = number;

/**
 *r" Lighting-domain rejection carried inside Rynk's outer protocol result.
 */
export type LightingError = "Unsupported" | "InvalidRequest" | "InvalidEffect" | "InvalidTtl" | { TopologyRevisionConflict: { expected: number; current: number } } | { StateRevisionConflict: { expected: number; current: number } } | { UnknownLed: { led_id: LightingLedId } } | { OverlayFull: { capacity: number } } | "TransactionBusy" | "InvalidTransaction" | "TransactionExpired" | { TransactionIncomplete: { expected: number; received: number } };

/**
 *r" One concrete output on one lighting node.
 */
export interface LightingOutput {
    node: LightingNodeId;
    id: LightingOutputId;
    pixel_count: number;
    capabilities: LightingOutputCapabilities;
    coverage: LightingOutputCoverage;
}

/**
 *r" One real key in RMK's logical matrix. Matrix holes have no record.
 */
export interface LightingMatrixPosition {
    row: number;
    col: number;
}

/**
 *r" One semantic light. It may have key association, explicit geometry,
 *r" both, or neither.
 */
export interface LightingLed {
    id: LightingLedId;
    key: LightingMatrixPosition | undefined;
    position: LightingPoint3 | undefined;
    /**
     *r" Span into the flat zone-membership table.
     */
    zone_start: number;
    zone_len: number;
}

/**
 *r" One transient overlay cell addressed by stable LED identity.
 */
export interface LightingOverlayCell {
    led_id: LightingLedId;
    effect: LightingEffect;
    /**
     *r" Relative lifetime. `None` lasts until unset, clear, or reboot;
     *r" `Some(0)` is invalid.
     */
    ttl_ms: number | undefined;
}

/**
 *r" Opaque transaction token allocated by the firmware.
 */
export interface LightingOverlayTransaction {
    id: number;
    cell_count: number;
}

/**
 *r" Optional capabilities beyond the mandatory state/topology surface.
 */
export type LightingFeatureFlags = number;

/**
 *r" Positive Q8.8 key dimensions in key-pitch units.
 */
export interface LightingKeySize {
    width: number;
    height: number;
}

/**
 *r" Revision-pinned request for one metadata page.
 */
export interface LightingPageRequest {
    topology_revision: number;
    offset: number;
}

/**
 *r" Shared physical-key geometry consumed by lighting, displays, and hosts.
 */
export interface LightingPhysicalKey {
    matrix: LightingMatrixPosition;
    center: LightingPoint3;
    size: LightingKeySize;
    /**
     *r" Clockwise rotation in hundredths of one degree.
     */
    rotation: number;
}

/**
 *r" Stable identity of one semantic lighting zone.
 */
export type LightingZoneId = number;

/**
 *r" Stable, board-wide identity of one independently controllable light.
 */
export type LightingLedId = number;

/**
 *r" Stable-light to physical-address mapping. Dense compositor slots are
 *r" intentionally not part of the public protocol.
 */
export interface LightingRoute {
    led_id: LightingLedId;
    node: LightingNodeId;
    output: LightingOutputId;
    physical_index: number;
}

/**
 *r" Static limits and topology identity for a lighting-enabled device.
 */
export interface LightingCapabilities {
    topology_revision: number;
    /**
     *r" Real logical matrix keys, including keys without measured geometry.
     */
    logical_key_count: number;
    physical_key_count: number;
    led_count: number;
    zone_count: number;
    zone_membership_count: number;
    output_count: number;
    route_count: number;
    overlay_capacity: number;
    page_capacity: number;
    overlay_chunk_capacity: number;
    features: LightingFeatureFlags;
    effects: LightingEffectFlags;
}

/**
 *r" VIA-compatible designated background. It is only the lowest standard
 *r" source; disabling it does not disable layers, overlays, or status.
 */
export interface LightingBackgroundState {
    enabled: boolean;
    hue: number;
    saturation: number;
    value: number;
    speed: number;
    mode: LightingBackgroundMode;
}

/**
 *r" Whether all physical pixels of an output must have a logical route.
 */
export type LightingOutputCoverage = "Complete" | "Sparse";

export interface AbortLightingOverlayReplaceRequest {
    transaction_id: number;
}

export interface ClearLightingOverlayRequest {
    expected_revision: number;
}

export interface CommitLightingOverlayReplaceRequest {
    transaction_id: number;
}

export interface LightingKeysPage {
    topology_revision: number;
    total_count: number;
    items: LightingMatrixPosition[];
}

export interface LightingLedsPage {
    topology_revision: number;
    total_count: number;
    items: LightingLed[];
}

export interface LightingMutableState {
    output_enabled: boolean;
    output_brightness: number;
    background: LightingBackgroundState;
}

export interface LightingOutputsPage {
    topology_revision: number;
    total_count: number;
    items: LightingOutput[];
}

export interface LightingPhysicalKeysPage {
    topology_revision: number;
    total_count: number;
    items: LightingPhysicalKey[];
}

export interface LightingRoutesPage {
    topology_revision: number;
    total_count: number;
    items: LightingRoute[];
}

export interface LightingZoneMembershipsPage {
    topology_revision: number;
    total_count: number;
    items: LightingZoneId[];
}

export interface LightingZonesPage {
    topology_revision: number;
    total_count: number;
    items: LightingZone[];
}

export interface SetLightingOverlayRequest {
    expected_revision: number;
    cell: LightingOverlayCell;
}

export interface SetLightingStateRequest {
    expected_revision: number;
    state: LightingMutableState;
}

export interface UnsetLightingOverlayRequest {
    expected_revision: number;
    led_id: LightingLedId;
}

export type HidKeyCode = "No" | "ErrorRollover" | "PostFail" | "ErrorUndefined" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" | "Kc1" | "Kc2" | "Kc3" | "Kc4" | "Kc5" | "Kc6" | "Kc7" | "Kc8" | "Kc9" | "Kc0" | "Enter" | "Escape" | "Backspace" | "Tab" | "Space" | "Minus" | "Equal" | "LeftBracket" | "RightBracket" | "Backslash" | "NonusHash" | "Semicolon" | "Quote" | "Grave" | "Comma" | "Dot" | "Slash" | "CapsLock" | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11" | "F12" | "PrintScreen" | "ScrollLock" | "Pause" | "Insert" | "Home" | "PageUp" | "Delete" | "End" | "PageDown" | "Right" | "Left" | "Down" | "Up" | "NumLock" | "KpSlash" | "KpAsterisk" | "KpMinus" | "KpPlus" | "KpEnter" | "Kp1" | "Kp2" | "Kp3" | "Kp4" | "Kp5" | "Kp6" | "Kp7" | "Kp8" | "Kp9" | "Kp0" | "KpDot" | "NonusBackslash" | "Application" | "KbPower" | "KpEqual" | "F13" | "F14" | "F15" | "F16" | "F17" | "F18" | "F19" | "F20" | "F21" | "F22" | "F23" | "F24" | "Execute" | "Help" | "Menu" | "Select" | "Stop" | "Again" | "Undo" | "Cut" | "Copy" | "Paste" | "Find" | "KbMute" | "KbVolumeUp" | "KbVolumeDown" | "LockingCapsLock" | "LockingNumLock" | "LockingScrollLock" | "KpComma" | "KpEqualAs400" | "International1" | "International2" | "International3" | "International4" | "International5" | "International6" | "International7" | "International8" | "International9" | "Language1" | "Language2" | "Language3" | "Language4" | "Language5" | "Language6" | "Language7" | "Language8" | "Language9" | "AlternateErase" | "SystemRequest" | "Cancel" | "Clear" | "Prior" | "Return" | "Separator" | "Out" | "Oper" | "ClearAgain" | "Crsel" | "Exsel" | "SystemPower" | "SystemSleep" | "SystemWake" | "AudioMute" | "AudioVolUp" | "AudioVolDown" | "MediaNextTrack" | "MediaPrevTrack" | "MediaStop" | "MediaPlayPause" | "MediaSelect" | "MediaEject" | "Mail" | "Calculator" | "MyComputer" | "WwwSearch" | "WwwHome" | "WwwBack" | "WwwForward" | "WwwStop" | "WwwRefresh" | "WwwFavorites" | "MediaFastForward" | "MediaRewind" | "BrightnessUp" | "BrightnessDown" | "ControlPanel" | "Assistant" | "MissionControl" | "Launchpad" | "MouseUp" | "MouseDown" | "MouseLeft" | "MouseRight" | "MouseBtn1" | "MouseBtn2" | "MouseBtn3" | "MouseBtn4" | "MouseBtn5" | "MouseBtn6" | "MouseBtn7" | "MouseBtn8" | "MouseWheelUp" | "MouseWheelDown" | "MouseWheelLeft" | "MouseWheelRight" | "MouseAccel0" | "MouseAccel1" | "MouseAccel2" | "LCtrl" | "LShift" | "LAlt" | "LGui" | "RCtrl" | "RShift" | "RAlt" | "RGui";

export type KeyCode = { Hid: HidKeyCode } | { Consumer: ConsumerKey } | { SystemControl: SystemControlKey };

export type LedIndicator = { num_lock: boolean; caps_lock: boolean; scroll_lock: boolean; compose: boolean; kana: boolean; };

export type LightingBackgroundMode = "Solid" | "Breathe";

export type ModifierCombination = { left_ctrl: boolean; left_shift: boolean; left_alt: boolean; left_gui: boolean; right_ctrl: boolean; right_shift: boolean; right_alt: boolean; right_gui: boolean; };

export type MorseProfile = { unilateral_tap: boolean | undefined; enable_flow_tap: boolean | undefined; mode: MorseMode | undefined; hold_timeout_ms: number | undefined; gap_timeout_ms: number | undefined; };

export type MouseButtons = { button1: boolean; button2: boolean; button3: boolean; button4: boolean; button5: boolean; button6: boolean; button7: boolean; button8: boolean; };


/**
 * Live Rynk client handle exposed to JavaScript.
 *
 * Wraps the session's `Client` + `Driver`. All methods are `&self`: a parked
 * `next_topic()` pull and one request may run concurrently (full-duplex), but
 * keep requests serialized — the protocol allows a single request in flight.
 * Dropping the handle, or closing the JS link, ends the session; the link
 * itself stays open until the page closes it.
 */
export class RynkClient {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort_lighting_overlay_replace(request: AbortLightingOverlayReplaceRequest): Promise<void>;
    begin_lighting_overlay_replace(request: BeginLightingOverlayReplaceRequest): Promise<LightingOverlayTransaction>;
    bootloader_jump(): Promise<void>;
    clear_ble_profile(slot: number): Promise<void>;
    clear_lighting_overlay(request: ClearLightingOverlayRequest): Promise<LightingState>;
    commit_lighting_overlay_replace(request: CommitLightingOverlayReplaceRequest): Promise<LightingState>;
    get_battery_status(): Promise<BatteryStatus>;
    get_behavior(): Promise<BehaviorConfig>;
    get_ble_status(): Promise<BleStatus>;
    get_capabilities(): Promise<DeviceCapabilities>;
    get_combo(index: number): Promise<Combo>;
    get_combo_bulk(start_index: number): Promise<GetComboBulkResponse>;
    get_connection_status(): Promise<ConnectionStatus>;
    get_connection_type(): Promise<ConnectionType>;
    get_current_layer(): Promise<number>;
    get_default_layer(): Promise<number>;
    get_device_info(): Promise<DeviceInfo>;
    get_encoder(encoder_id: number, layer: number): Promise<EncoderAction>;
    get_fork(index: number): Promise<Fork>;
    get_key(layer: number, row: number, col: number): Promise<KeyAction>;
    get_keymap_bulk(layer: number, start_row: number, start_col: number): Promise<GetKeymapBulkResponse>;
    get_layout(): Promise<LayoutInfo>;
    get_led_indicator(): Promise<LedIndicator>;
    get_lighting_capabilities(): Promise<LightingCapabilities>;
    get_lighting_keys(request: LightingPageRequest): Promise<LightingKeysPage>;
    get_lighting_leds(request: LightingPageRequest): Promise<LightingLedsPage>;
    get_lighting_outputs(request: LightingPageRequest): Promise<LightingOutputsPage>;
    get_lighting_physical_keys(request: LightingPageRequest): Promise<LightingPhysicalKeysPage>;
    get_lighting_routes(request: LightingPageRequest): Promise<LightingRoutesPage>;
    get_lighting_state(): Promise<LightingState>;
    get_lighting_zone_memberships(request: LightingPageRequest): Promise<LightingZoneMembershipsPage>;
    get_lighting_zones(request: LightingPageRequest): Promise<LightingZonesPage>;
    get_lock_status(): Promise<LockStatus>;
    get_macro(offset: number): Promise<MacroData>;
    get_matrix_state(): Promise<MatrixState>;
    get_morse(index: number): Promise<Morse>;
    get_morse_bulk(start_index: number): Promise<GetMorseBulkResponse>;
    get_peripheral_status(slot: number): Promise<PeripheralStatus>;
    get_sleep_state(): Promise<boolean>;
    get_version(): Promise<ProtocolVersion>;
    get_wpm(): Promise<number>;
    lock(): Promise<void>;
    /**
     * Pull the next recognized topic push (server→host). Parks until one
     * arrives; rejects when the link dies. Unrecognized topics are skipped.
     * JS drives this in a loop, like the native `next_topic()` pull, and it
     * runs concurrently with the request methods.
     */
    next_topic(): Promise<TopicEvent>;
    put_lighting_overlay_chunk(request: PutLightingOverlayChunkRequest): Promise<void>;
    reboot(): Promise<void>;
    set_behavior(config: BehaviorConfig): Promise<void>;
    set_combo(index: number, config: Combo): Promise<void>;
    set_combo_bulk(request: SetComboBulkRequest): Promise<void>;
    set_default_layer(layer: number): Promise<void>;
    set_encoder(encoder_id: number, layer: number, action: EncoderAction): Promise<void>;
    set_fork(index: number, config: Fork): Promise<void>;
    set_key(layer: number, row: number, col: number, action: KeyAction): Promise<void>;
    set_keymap_bulk(request: SetKeymapBulkRequest): Promise<void>;
    set_lighting_overlay(request: SetLightingOverlayRequest): Promise<LightingState>;
    set_lighting_state(request: SetLightingStateRequest): Promise<LightingState>;
    set_macro(offset: number, data: MacroData): Promise<void>;
    set_morse(index: number, config: Morse): Promise<void>;
    set_morse_bulk(request: SetMorseBulkRequest): Promise<void>;
    storage_reset(mode: StorageResetMode): Promise<void>;
    switch_ble_profile(slot: number): Promise<void>;
    unlock_poll(): Promise<LockStatus>;
    unset_lighting_overlay(request: UnsetLightingOverlayRequest): Promise<LightingState>;
}

/**
 * Handshake over an already-open JS link and return a client. The link is the
 * web transport's [`RynkDevice`], so the browser path uses the same connect
 * lifecycle as the native serial/BLE transports.
 */
export function connect(link: any): Promise<RynkClient>;

export function init(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly _critical_section_1_0_acquire: () => number;
    readonly _critical_section_1_0_release: (a: number) => void;
    readonly __wbg_rynkclient_free: (a: number, b: number) => void;
    readonly connect: (a: any) => any;
    readonly rynkclient_abort_lighting_overlay_replace: (a: number, b: any) => any;
    readonly rynkclient_begin_lighting_overlay_replace: (a: number, b: any) => any;
    readonly rynkclient_bootloader_jump: (a: number) => any;
    readonly rynkclient_clear_ble_profile: (a: number, b: number) => any;
    readonly rynkclient_clear_lighting_overlay: (a: number, b: any) => any;
    readonly rynkclient_commit_lighting_overlay_replace: (a: number, b: any) => any;
    readonly rynkclient_get_battery_status: (a: number) => any;
    readonly rynkclient_get_behavior: (a: number) => any;
    readonly rynkclient_get_ble_status: (a: number) => any;
    readonly rynkclient_get_capabilities: (a: number) => any;
    readonly rynkclient_get_combo: (a: number, b: number) => any;
    readonly rynkclient_get_combo_bulk: (a: number, b: number) => any;
    readonly rynkclient_get_connection_status: (a: number) => any;
    readonly rynkclient_get_connection_type: (a: number) => any;
    readonly rynkclient_get_current_layer: (a: number) => any;
    readonly rynkclient_get_default_layer: (a: number) => any;
    readonly rynkclient_get_device_info: (a: number) => any;
    readonly rynkclient_get_encoder: (a: number, b: number, c: number) => any;
    readonly rynkclient_get_fork: (a: number, b: number) => any;
    readonly rynkclient_get_key: (a: number, b: number, c: number, d: number) => any;
    readonly rynkclient_get_keymap_bulk: (a: number, b: number, c: number, d: number) => any;
    readonly rynkclient_get_layout: (a: number) => any;
    readonly rynkclient_get_led_indicator: (a: number) => any;
    readonly rynkclient_get_lighting_capabilities: (a: number) => any;
    readonly rynkclient_get_lighting_keys: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_leds: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_outputs: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_physical_keys: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_routes: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_state: (a: number) => any;
    readonly rynkclient_get_lighting_zone_memberships: (a: number, b: any) => any;
    readonly rynkclient_get_lighting_zones: (a: number, b: any) => any;
    readonly rynkclient_get_lock_status: (a: number) => any;
    readonly rynkclient_get_macro: (a: number, b: number) => any;
    readonly rynkclient_get_matrix_state: (a: number) => any;
    readonly rynkclient_get_morse: (a: number, b: number) => any;
    readonly rynkclient_get_morse_bulk: (a: number, b: number) => any;
    readonly rynkclient_get_peripheral_status: (a: number, b: number) => any;
    readonly rynkclient_get_sleep_state: (a: number) => any;
    readonly rynkclient_get_version: (a: number) => any;
    readonly rynkclient_get_wpm: (a: number) => any;
    readonly rynkclient_lock: (a: number) => any;
    readonly rynkclient_next_topic: (a: number) => any;
    readonly rynkclient_put_lighting_overlay_chunk: (a: number, b: any) => any;
    readonly rynkclient_reboot: (a: number) => any;
    readonly rynkclient_set_behavior: (a: number, b: any) => any;
    readonly rynkclient_set_combo: (a: number, b: number, c: any) => any;
    readonly rynkclient_set_combo_bulk: (a: number, b: any) => any;
    readonly rynkclient_set_default_layer: (a: number, b: number) => any;
    readonly rynkclient_set_encoder: (a: number, b: number, c: number, d: any) => any;
    readonly rynkclient_set_fork: (a: number, b: number, c: any) => any;
    readonly rynkclient_set_key: (a: number, b: number, c: number, d: number, e: any) => any;
    readonly rynkclient_set_keymap_bulk: (a: number, b: any) => any;
    readonly rynkclient_set_lighting_overlay: (a: number, b: any) => any;
    readonly rynkclient_set_lighting_state: (a: number, b: any) => any;
    readonly rynkclient_set_macro: (a: number, b: number, c: any) => any;
    readonly rynkclient_set_morse: (a: number, b: number, c: any) => any;
    readonly rynkclient_set_morse_bulk: (a: number, b: any) => any;
    readonly rynkclient_storage_reset: (a: number, b: any) => any;
    readonly rynkclient_switch_ble_profile: (a: number, b: number) => any;
    readonly rynkclient_unlock_poll: (a: number) => any;
    readonly rynkclient_unset_lighting_overlay: (a: number, b: any) => any;
    readonly init: () => void;
    readonly wasm_bindgen_131d9c369ca8bda___convert__closures_____invoke___wasm_bindgen_131d9c369ca8bda___JsValue__core_7d5f0a2ba6a62c33___result__Result_____wasm_bindgen_131d9c369ca8bda___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_131d9c369ca8bda___convert__closures_____invoke___js_sys_bfa7dc20d6a7225c___Function_fn_wasm_bindgen_131d9c369ca8bda___JsValue_____wasm_bindgen_131d9c369ca8bda___sys__Undefined___js_sys_bfa7dc20d6a7225c___Function_fn_wasm_bindgen_131d9c369ca8bda___JsValue_____wasm_bindgen_131d9c369ca8bda___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
