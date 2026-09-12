import { BaseTap, type Grip, type GripContext } from '@owebeeone/grip-react';
import type { GyldDecideNow } from '../contract';
import {
  GYLD_BUNDLE, GYLD_DECIDE_NOW, GYLD_DEST_REF, GYLD_RECORD, GYLD_RECORDS,
} from '../grips';
import { BUNDLE_UNSET, type GyldBundle, type GyldValue } from '../store/state';
import {
  RECORDS_UNSET, RECORD_UNSET, recordView, recordsOf,
  type GyldRecordView, type GyldRecords,
} from './records';

// Step 1.2: the two conversion taps (spec section 3.4). Both are class 3
// conversions: every input is another grip, there is no store, no clock and no
// fetch, and a second call with the same inputs gives the same answer.
//
// Memoization is by INPUT IDENTITY. The store tap hands out the same bundle
// object while the bytes do not change, so an unchanged bundle re-uses the
// index it already produced and no consumer re-renders.

/** The slice of grip-core's Destination these taps read. */
interface ConversionDestination {
  getContext(): GripContext | undefined;
  getGrips(): ReadonlySet<Grip<unknown>>;
  getDestinationParamValue<T>(grip: Grip<T>): T | undefined;
}

abstract class ConversionTap extends BaseTap {
  produce(opts?: { destContext?: GripContext }): void {
    if (opts?.destContext) {
      const destination = this.getDestination(opts.destContext);
      if (destination) {
        this.produceDest(destination as unknown as ConversionDestination);
      }
      return;
    }
    for (const destination of this.allDestinations()) {
      this.produceDest(destination);
    }
  }

  produceOnDestParams(destContext: GripContext | undefined): void {
    if (destContext) {
      this.produce({ destContext });
    } else {
      this.produce();
    }
  }

  // A conversion tap has no HOME parameters at all: everything it reads is
  // per destination, so there is nothing for a home change to recompute.
  produceOnParams(): void {}

  protected allDestinations(): ConversionDestination[] {
    return Array.from(
      (this.producer?.getDestinations().values() ?? []) as Iterable<ConversionDestination>,
    );
  }

  protected abstract produceDest(dest: ConversionDestination): void;
}

/**
 * `Gyld.Records`: the id and slot index over the destination's bundle. Nothing
 * is inferred. Adjacency comes from the emitted assertions' own references and
 * the emitted parent chain, so an edge that Gyld did not assert cannot appear.
 */
export class GyldIndexTap extends ConversionTap {
  private readonly indexes = new WeakMap<GyldBundle, GyldRecords>();

  constructor() {
    super({
      provides: [GYLD_RECORDS],
      destinationParamGrips: [GYLD_BUNDLE],
    });
  }

  protected produceDest(dest: ConversionDestination): void {
    const context = dest.getContext();
    if (!context) {
      return;
    }
    this.publish(
      new Map<Grip<unknown>, unknown>([[
        GYLD_RECORDS as unknown as Grip<unknown>, this.indexFor(dest),
      ]]),
      context,
    );
  }

  private indexFor(dest: ConversionDestination): GyldRecords {
    const bundle = dest.getDestinationParamValue(GYLD_BUNDLE) ?? BUNDLE_UNSET;
    const held = this.indexes.get(bundle);
    if (held) {
      return held;
    }
    const built = recordsOf(bundle);
    this.indexes.set(bundle, built);
    return built;
  }
}

/**
 * `Gyld.Record`: the `gyld.inspect-record.v1` shaped view of the one record
 * the destination's `Gyld.Dest.Ref` names, composed from the index and the
 * emitted decide-now row. Spec section 7.7 reserves the right to use an
 * emitted `inspect/<slot>.json` verbatim when a bundle carries one; no bundle
 * does yet, so this composes and says so through `sort` and the closure it
 * actually found.
 */
export class GyldRecordTap extends ConversionTap {
  private readonly views = new WeakMap<GyldRecords, Map<string, GyldRecordView>>();

  constructor() {
    super({
      provides: [GYLD_RECORD],
      destinationParamGrips: [GYLD_RECORDS, GYLD_DECIDE_NOW, GYLD_DEST_REF],
    });
  }

  protected produceDest(dest: ConversionDestination): void {
    const context = dest.getContext();
    if (!context) {
      return;
    }
    this.publish(
      new Map<Grip<unknown>, unknown>([[
        GYLD_RECORD as unknown as Grip<unknown>, this.viewFor(dest),
      ]]),
      context,
    );
  }

  private viewFor(dest: ConversionDestination): GyldRecordView {
    const records = dest.getDestinationParamValue(GYLD_RECORDS) ?? RECORDS_UNSET;
    const rawRef = dest.getDestinationParamValue(GYLD_DEST_REF);
    const ref = typeof rawRef === 'string' ? rawRef : '';
    if (ref === '' && records.status === 'unset') {
      return RECORD_UNSET;
    }
    const decideNow = dest.getDestinationParamValue(GYLD_DECIDE_NOW) as
      GyldValue<GyldDecideNow> | undefined;
    // One cache per index object, keyed by ref: a detail window following a
    // selection walks many refs over one unchanged bundle.
    let byRef = this.views.get(records);
    if (!byRef) {
      byRef = new Map();
      this.views.set(records, byRef);
    }
    const key = `${ref}\u0000${decideNow?.status ?? 'unset'}`;
    const held = byRef.get(key);
    if (held) {
      return held;
    }
    const built = recordView(records, ref, decideNow?.value);
    byRef.set(key, built);
    return built;
  }
}
