/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { Id64, Id64String } from "@bentley/bentleyjs-core";
import {
  ColorEntryProps, CuttingPlaneEntryProps, ElementGroupProps, ElementTimelineProps, ModelTimelineProps, RenderTimelineScriptProps, TimelineProps, TransformEntryProps, VisibilityEntryProps,
} from "./RenderTimelineProps";

/** Object that helps assemble a [[TimelineProps]] as part of a [[RenderTimelineScriptBuilder]].
 * @beta
 */
export class TimelineBuilder {
  protected readonly _props: TimelineProps = { };

  public addVisibilityEntry(props: VisibilityEntryProps): void {
    if (!this._props.visibilityTimeline)
      this._props.visibilityTimeline = [];

    this._props.visibilityTimeline.push({ ...props });
  }

  public addColorEntry(props: ColorEntryProps): void {
    if (!this._props.colorTimeline)
      this._props.colorTimeline = [];

    this._props.colorTimeline.push({ ...props });
  }

  public addTransformEntry(props: TransformEntryProps): void {
    if (!this._props.transformTimeline)
      this._props.transformTimeline = [];

    this._props.transformTimeline.push({ ...props });
  }

  public addCuttingPlaneEntry(props: CuttingPlaneEntryProps): void {
    if (!this._props.cuttingPlaneTimeline)
      this._props.cuttingPlaneTimeline = [];

    this._props.cuttingPlaneTimeline.push({ ...props });
  }
}

/** Object that helps assemble an [[ElementTimelineProps]] as part of a [[RenderTimelineScriptBuilder]]. */
class ElementTimelineBuilder extends TimelineBuilder {
  private readonly _batchId: number;
  private readonly _groupIndex: number;

  public constructor(batchId: number, groupIndex: number) {
    super();
    this._batchId = batchId;
    this._groupIndex = groupIndex;
  }

  public toJSON(): ElementTimelineProps {
    return {
      ...this._props,
      batchId: this._batchId,
      elementIds: this._groupIndex,
    };
  }
}

/** Object that helps assemble a [[ModelTimelineProps]] as part of a [[RenderTimelineScriptBuilder]].
 * @beta
 */
export class ModelTimelineBuilder extends TimelineBuilder {
  private readonly _scriptBuilder: RenderTimelineScriptBuilder;
  public readonly modelId: Id64String;
  private readonly _elementGroups: ElementGroupProps[] = [];
  private readonly _elementTimelines: ElementTimelineBuilder[] = [];
  /** @alpha */
  public realityModelUrl?: string;

  public constructor(scriptBuilder: RenderTimelineScriptBuilder, modelId: Id64String) {
    super();
    this._scriptBuilder = scriptBuilder;
    this.modelId = modelId;
  }

  /** Add a new group of elements and return the index that can subsequently be supplied to [[addElementTimeline]]. */
  public addElementGroup(props: ElementGroupProps): number {
    this._elementGroups.push({ ...props });
    return this._elementGroups.length - 1;
  }

  /** Add a new element timeline to be applied to the group of elements specified by `elementGroupIndex`.
   * @see [[addElementGroup]] to create and obtain the index of an element group.
   */
  public addElementTimeline(elementGroupIndex: number): TimelineBuilder {
    if (!this._elementGroups[elementGroupIndex])
      throw new Error(`Invalid element group index ${elementGroupIndex}`);

    const builder = new ElementTimelineBuilder(this._scriptBuilder.getNextBatchId(), elementGroupIndex);
    this._elementTimelines.push(builder);
    return builder;
  }

  public toJSON(): ModelTimelineProps {
    const props: ModelTimelineProps = {
      ...this._props,
      modelId: this.modelId,
      elementTimelines: this._elementTimelines.map((x) => x.toJSON()),
      elementGroups: [ ...this._elementGroups ],
    };

    if (this.realityModelUrl)
      props.realityModelUrl = this.realityModelUrl;

    return props;
  }
}

/** Object that helps assemble a [[RenderTimelineScriptProps]].
 * @beta
 */
export class RenderTimelineScriptBuilder {
  private readonly _modelTimelines: ModelTimelineBuilder[] = [];
  private _curBatchId = 0;

  /** Add a new model timeline to the script. */
  public addModelTimeline(modelId: Id64String): ModelTimelineBuilder {
    if (-1 !== this._modelTimelines.findIndex((x) => x.modelId === modelId))
      throw new Error(`RenderTimelineScriptBuilder already contains a timeline for model Id ${modelId}`);

    if (!Id64.isValidId64(modelId))
      throw new Error(`${modelId} is not a valid model Id`);

    const builder = new ModelTimelineBuilder(this, modelId);
    this._modelTimelines.push(builder);
    return builder;
  }

  /** Obtain the JSON representation of the timeline constructed by this builder. */
  public finish(): RenderTimelineScriptProps {
    return this._modelTimelines.map((x) => x.toJSON());
  }

  /** @internal */
  public getNextBatchId(): number {
    return ++this._curBatchId;
  }
}
