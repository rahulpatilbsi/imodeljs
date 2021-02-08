/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { CompressedId64Set, Id64String } from "@bentley/bentleyjs-core";
import { Point4dProps, TransformProps, XYZProps } from "@bentley/geometry-core";
import { RgbColorProps } from "./RgbColor";

/** Specifies how interpolation between two [[TimelineEntryProps]] should be performed.
 * @note Any values not listed below are treated as `Step`.
 * @beta
 */
export enum InterpolationType {
  /** No interpolation. */
  Step = 1,
  /** Linear interpolation. */
  Linear = 2,
  /* Not yet supported - comes from SYNCHRO
  Cubic = 3,
  */
}

/** Describes an entry in a [[TimelineProps]].
 * @beta
 */
export interface TimelineEntryProps {
  /** The timepoint in the [Unix Epoch](https://en.wikipedia.org/wiki/Unix_time) (POSIX), in seconds. */
  time: number;
  /** How to interpolate between two adjacent TimelineEntryProps' values. */
  interpolation: InterpolationType;
}

/** Describes an entry in a [[TimelineProps]] controlling the transparency of the associated geometry.
 * @beta
 */
export interface VisibilityEntryProps extends TimelineEntryProps {
  /** The visibility, from 0 (fully invisible) to 100 (fully visible). Intermediate values cause the geometry to be displayed as semi-transparent; for example, a value of 25 draws the geometry as 25% opaque (or, equivalently, 75% transparent). */
  value: number;
}

/** Describes an entry in a [[TimelineProps]] controlling the transparency of the associated geometry.
 * @beta
 */
export interface ColorEntryProps extends TimelineEntryProps {
  /** The color in which to draw the geometry. */
  value: RgbColorProps;
}

/** Describes a clipping plane for use in a [[CuttingPlaneEntryProps]].
 * @beta
 */
export interface CuttingPlaneProps {
  /** A point on the plane. */
  position: XYZProps;
  /** A vector describing the plane direction (towards the clip). */
  direction: XYZProps;
  /** If true, the geometry is completely visible - the clipping plane is ignored. */
  visible?: boolean;
  /** If true, the geometry is completely invisible - the clipping plane is ignored. */
  hidden?: boolean;
}

/** Describes an entry in a [[TimelineProps]] specifying a plane used to clip the associated geometry.
 * @beta
 */
export interface CuttingPlaneEntryProps extends TimelineEntryProps {
  /** The clipping plane to be applied. */
  value: CuttingPlaneProps;
}

/** Describes a [Transform]($geometry-core) as part of a [[TransformEntryProps]] in terms of a translation and a rotation about a pivot point.
 * @beta
 */
export interface TransformComponentProps {
  /** The translation to be applied after rotation. */
  position: XYZProps;
  /** A quaternion representing the rotation. */
  orientation: Point4dProps;
  /** The point about which to rotate. */
  pivot: XYZProps;
}

/** Describes an entry in a [[TimelineProps]] that applies a [Transform]($geometry-core) to the associated geometry.
 * @beta
 */
export interface TransformEntryProps extends TimelineEntryProps {
  /** The transform to apply. */
  value: TransformProps | TransformComponentProps;
}

/** Describes a set of timelines controlling aspects of symbology, position, and visibility of a model ([[ModelTimelineProps]])or a set of elements ([[ElementTimelineProps]]).
 * @beta
 */
export interface TimelineProps {
  /** Timeline controlling visibility (transparency) of the associated geometry. */
  visibilityTimeline?: VisibilityEntryProps[];
  /** Timeline controlling the color of the associated geometry. */
  colorTimeline?: ColorEntryProps[];
  /** Timeline applying a series of [Transform]($geometry-core)s to the associated geometry. */
  transformTimeline?: TransformEntryProps[];
  /** Timeline applying a series of clipping planes to the associated geometry. */
  cuttingPlaneTimeline?: CuttingPlaneEntryProps[];
}

/** Describes a group of elements to be affected by an [[ElementTimelineProps]].
 * @beta
 */
export interface ElementGroupProps {
  /** The Ids of the elements. */
  ids: CompressedId64Set;
  /** If true, all child elements (and grandchildren, and so on) of the elements specified by `ids` should be included in the group.
   * @note It is preferable to set this to `true` instead of including every descendant element's Id in `ids`.
   */
  includeDescendants?: boolean;
}

/** Describes a set of timelines to be applied to a group of elements residing in a single model, as part of a [[ModelTimelineProps]].
 * @beta
 */
export interface ElementTimelineProps extends TimelineProps {
  /** An integer greater than zero uniquely identifying this timeline among all `ElementTimelineProps` within a [[RenderTimelineScriptProps]]. */
  batchId: number;
  /** Specifies to which elements the timelines are to be applied, as one of the following types:
   *  - [CompressedId64Set]($bentleyjs-core) - a compact string representation of all of the elements' Ids; or
   *  - an array of [Id64String]($bentleyjs-core)s; or
   *  - an index into the `elementGroups` array of the [[ModelTimelineProps]] to which this `ElementTimelineProps` belongs.
   * The [[ElementGroupProps]] index is preferred, as it reduces duplication and allows descendant elements to be included without explicitly specifying their Ids.
   * The array of `Id64String`s is the least preferable option as it can result in very long lists of very long Id strings.
   */
  elementIds: CompressedId64Set | number | Id64String[];
}

/** Describes a set of timelines to be applied to a single model, and/or to groups of elements within that model.
 * @beta
 */
export interface ModelTimelineProps extends TimelineProps {
  /** The Id of the [GeometricModel]($backend) to which the timelines apply. */
  modelId: Id64String;
  /** Timelines to be applied to groups of elements within the model. */
  elementTimelines: ElementTimelineProps[];
  /** An array of groups of elements that can be indexed by [[ElementTimelineProps.elementIds]], to conserve space and reduce duplication. */
  elementGroups?: ElementGroupProps[];
  /** @alpha */
  realityModelUrl?: string;
}

/** A script that can vary the visibility, position, and symbology of groups of elements over a period of time.
 * Each timeline in the array describes the changes to be applied to one geometric model.
 * @beta
 */
export type RenderTimelineScriptProps = ModelTimelineProps[];

/*
export class RenderTimelineScript {
  protected readonly _props: RenderTimelineScriptProps;
  protected _duration?: Range1d;

  protected constructor(props: RenderTimelineScriptProps) {
    this._props = props;
  }
}
*/
