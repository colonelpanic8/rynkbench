// RynkSession over a live wasm RynkClient.
//
// The protocol allows one request in flight (next_topic is the sanctioned
// exception: one parked pull runs alongside one request), so every op goes
// through a serializing queue. A topic pump runs from construction until the
// link dies; multi-message operations (keymap sweep, topology read, overlay
// transaction) hold the queue for their whole critical section.

import type {
  KeyAction,
  LightingCapabilities,
  LightingOverlayCell,
  LightingPageRequest,
  LightingState,
  RynkClient,
  TopicEvent,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type {
  DeviceOps,
  KeymapOps,
  LayerKeymap,
  LightingOps,
  LightingTopology,
  RynkSession,
} from "../types";
import type { RynkByteLink } from "./link";

interface LightingPage<T> {
  topology_revision: number;
  total_count: number;
  items: T[];
}

const TOPOLOGY_READ_ATTEMPTS = 3;

/** The topology changed under a paged read; the whole read restarts. */
class TopologyDrift extends Error {
  constructor(expected: number, got: number) {
    super(`lighting topology revision changed mid-read (${expected} -> ${got})`);
  }
}

function isRevisionConflict(error: unknown): boolean {
  // The firmware may reject a stale-pinned page outright instead of returning
  // a fresh-revision page; the wasm layer surfaces that as a serialized
  // LightingError. Either shape means: restart the read.
  return error instanceof TopologyDrift || String(error).includes("TopologyRevisionConflict");
}

export class WebHidSession implements RynkSession {
  readonly kind = "webhid" as const;
  readonly label: string;
  readonly device: DeviceOps;
  readonly keymap: KeymapOps;
  readonly lighting: LightingOps;

  private readonly client: RynkClient;
  private readonly link: RynkByteLink;
  private readonly hidDevice: HIDDevice;
  private readonly onHidDisconnect: (ev: { device: HIDDevice }) => void;
  private readonly pumpDone: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private chunkCapacity: number | null = null;
  private topicHandler: ((event: TopicEvent) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;

  constructor(client: RynkClient, link: RynkByteLink, hidDevice: HIDDevice) {
    this.client = client;
    this.link = link;
    this.hidDevice = hidDevice;
    this.label = link.label;

    this.onHidDisconnect = ({ device }) => {
      if (device !== this.hidDevice) return;
      this.link.end();
      if (!this.closed) this.disconnectHandler?.();
    };
    navigator.hid.addEventListener("disconnect", this.onHidDisconnect);
    this.pumpDone = this.pumpTopics();

    this.device = {
      info: () => this.run(() => client.get_device_info()),
      capabilities: () => this.run(() => client.get_capabilities()),
      protocolVersion: () => this.run(() => client.get_version()),
      layout: () => this.run(() => client.get_layout()),
      battery: () => this.run(() => client.get_battery_status()),
      connectionStatus: () => this.run(() => client.get_connection_status()),
      rebootToBootloader: () => this.run(() => client.bootloader_jump()),
    };

    this.keymap = {
      readAll: () => this.run(() => this.readAllLayers()),
      setKey: (layer, row, col, action) => this.run(() => client.set_key(layer, row, col, action)),
      getEncoder: (encoderId, layer) => this.run(() => client.get_encoder(encoderId, layer)),
      setEncoder: (encoderId, layer, action) =>
        this.run(() => client.set_encoder(encoderId, layer, action)),
      currentLayer: () => this.run(() => client.get_current_layer()),
      defaultLayer: () => this.run(() => client.get_default_layer()),
      setDefaultLayer: (layer) => this.run(() => client.set_default_layer(layer)),
    };

    this.lighting = {
      capabilities: () => this.run(() => client.get_lighting_capabilities()),
      state: () => this.run(() => client.get_lighting_state()),
      topology: () => this.run(() => this.readTopology()),
      replaceOverlay: (cells) => this.run(() => this.replaceOverlayCells(cells)),
      clearOverlay: () =>
        this.run(async () => {
          const state = await client.get_lighting_state();
          return client.clear_lighting_overlay({ expected_revision: state.revision });
        }),
      readOverlay: async () => {
        throw new Error(
          "Overlay readback is not part of the Rynk wire protocol; " +
            "the WebHID backend cannot read the overlay back",
        );
      },
    };
  }

  onTopic(handler: (event: TopicEvent) => void): void {
    this.topicHandler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    navigator.hid.removeEventListener("disconnect", this.onHidDisconnect);
    // Ending the link rejects the parked next_topic and any in-flight
    // request; only free the wasm handle once both have settled.
    await this.link.close();
    await this.queue;
    await this.pumpDone;
    this.client.free();
  }

  /** Serialize ops: the protocol allows a single request in flight. */
  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async pumpTopics(): Promise<void> {
    for (;;) {
      let event: TopicEvent;
      try {
        event = await this.client.next_topic();
      } catch {
        return; // link died or session closed
      }
      if (this.closed) return;
      this.topicHandler?.(event);
    }
  }

  private async readAllLayers(): Promise<LayerKeymap[]> {
    const caps = await this.client.get_capabilities();
    const perLayer = caps.num_rows * caps.num_cols;
    const layers: LayerKeymap[] = [];
    for (let layer = 0; layer < caps.num_layers; layer++) {
      const actions: KeyAction[] = [];
      if (caps.bulk_transfer_supported) {
        while (actions.length < perLayer) {
          const row = Math.floor(actions.length / caps.num_cols);
          const col = actions.length % caps.num_cols;
          const page = await this.client.get_keymap_bulk(layer, row, col);
          if (page.actions.length === 0) {
            throw new Error(`keymap bulk read stalled at layer ${layer}, key ${actions.length}`);
          }
          actions.push(...page.actions.slice(0, perLayer - actions.length));
        }
      } else {
        for (let key = 0; key < perLayer; key++) {
          actions.push(
            await this.client.get_key(layer, Math.floor(key / caps.num_cols), key % caps.num_cols),
          );
        }
      }
      layers.push({ layer, actions });
    }
    return layers;
  }

  private async readTopology(): Promise<LightingTopology> {
    let lastDrift: unknown;
    for (let attempt = 0; attempt < TOPOLOGY_READ_ATTEMPTS; attempt++) {
      const caps = await this.client.get_lighting_capabilities();
      try {
        return await this.readTopologyAt(caps);
      } catch (error) {
        if (!isRevisionConflict(error)) throw error;
        lastDrift = error;
      }
    }
    throw new Error(
      `lighting topology kept changing across ${TOPOLOGY_READ_ATTEMPTS} read attempts`,
      { cause: lastDrift },
    );
  }

  private async readTopologyAt(caps: LightingCapabilities): Promise<LightingTopology> {
    const revision = caps.topology_revision;
    return {
      revision,
      keys: await this.readPages(
        (r) => this.client.get_lighting_keys(r),
        revision,
        caps.logical_key_count,
      ),
      physicalKeys: await this.readPages(
        (r) => this.client.get_lighting_physical_keys(r),
        revision,
        caps.physical_key_count,
      ),
      leds: await this.readPages((r) => this.client.get_lighting_leds(r), revision, caps.led_count),
      routes: await this.readPages(
        (r) => this.client.get_lighting_routes(r),
        revision,
        caps.route_count,
      ),
      zones: await this.readPages(
        (r) => this.client.get_lighting_zones(r),
        revision,
        caps.zone_count,
      ),
      zoneMemberships: await this.readPages(
        (r) => this.client.get_lighting_zone_memberships(r),
        revision,
        caps.zone_membership_count,
      ),
    };
  }

  private async readPages<T>(
    fetch: (request: LightingPageRequest) => Promise<LightingPage<T>>,
    revision: number,
    total: number,
  ): Promise<T[]> {
    const items: T[] = [];
    while (items.length < total) {
      const page = await fetch({ topology_revision: revision, offset: items.length });
      if (page.topology_revision !== revision || page.total_count !== total) {
        throw new TopologyDrift(revision, page.topology_revision);
      }
      if (page.items.length === 0) {
        throw new Error(`lighting topology page stalled at item ${items.length} of ${total}`);
      }
      items.push(...page.items);
    }
    return items;
  }

  private async replaceOverlayCells(cells: LightingOverlayCell[]): Promise<LightingState> {
    const chunkCapacity = await this.overlayChunkCapacity();
    const state = await this.client.get_lighting_state();
    const transaction = await this.client.begin_lighting_overlay_replace({
      expected_revision: state.revision,
      cell_count: cells.length,
    });
    try {
      for (let offset = 0; offset < cells.length; offset += chunkCapacity) {
        await this.client.put_lighting_overlay_chunk({
          transaction_id: transaction.id,
          offset,
          cells: cells.slice(offset, offset + chunkCapacity),
        });
      }
      return await this.client.commit_lighting_overlay_replace({
        transaction_id: transaction.id,
      });
    } catch (error) {
      await this.client
        .abort_lighting_overlay_replace({ transaction_id: transaction.id })
        .catch(() => undefined);
      throw error;
    }
  }

  private async overlayChunkCapacity(): Promise<number> {
    if (this.chunkCapacity === null) {
      const caps = await this.client.get_lighting_capabilities();
      this.chunkCapacity = Math.max(1, caps.overlay_chunk_capacity);
    }
    return this.chunkCapacity;
  }
}
