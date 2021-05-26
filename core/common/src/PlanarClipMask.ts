/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module DisplayStyles
 */

import { CompressedId64Set, Id64String } from "@bentley/bentleyjs-core";

/** The different modes by which a [[PlanarClipMaskSettings]] collects the geometry used to mask a model.
 * @public
 */
export enum PlanarClipMaskMode {
  /** No masking. */
  None = 0,
  /** Mask based on priority. Different types of models have different default priorities as enumerated by [[PlanarClipMaskPriority]].
   * For example, background maps have the lowest priority, so they are masked by all other types, while design models have the highest priority and are therefore never masked.
   * The priority of a reality model can be overridden by [[PlanarClipMaskSettings.priority]]. This is useful to allow one reality model to mask another overlapping one.
   */
  Priority = 1,
  /** Indicates that masks should be produced from the geometry in a set of [GeometricModel]($backend)s. */
  Models = 2,
  /** Indicates that masks should be produced from geometry belonging to a set of subcategories. */
  IncludeSubCategories = 3,
  /** Indicates that masks should be produced from the geometry of a set of [GeometricElement]($backend)s. */
  IncludeElements = 4,
  /** Indicates that masks should be produced from the geometry of all [GeometricElement]($backend)s in a view, **except** for a specified set of excluded elements. */
  ExcludeElements = 5,
}

/** The default priority values for a [[PlanarClipMaskSettings]], based on model type. Models with a lower priority is masked by models with a higher priority
 * in [[PlanarClipMaskMode.Priority]].
 * The default can be overridden by [[PlanarClipMaskSettings.priority]].
 *  @public
 */
export enum PlanarClipMaskPriority {
  /** Background map. */
  BackgroundMap = -2048,
  /** A reality model that spans the globe - e.g., OpenStreetMaps Buildings. */
  GlobalRealityModel = -1024,
  /** A reality model with a bounded range. */
  RealityModel = 0,
  /** A design model stored in the [IModelDb]($backend). */
  DesignModel = 2048,
  /** The maximum supported priority. */
  Maximum = 4096,
}

/** JSON representation of a [[PlanarClipMaskSettings]].
 * @see [[DisplayStyleSettingsProps.planarClipOvr and [[ContextRealityModelProps.planarClipMask]].
 * @public
 */
export interface  PlanarClipMaskProps {
  /** Controls how the mask geometry is collected */
  mode: PlanarClipMaskMode;
  /** @see [[PlanarClipMaskSettings.modelIds]]. */
  modelIds?: CompressedId64Set;
  /** @see [[PlanarClipMaskSettings.subCategoryOrElementIds]]. */
  subCategoryOrElementIds?: CompressedId64Set;
  /** @see [[PlanarClipMaskSettings.priority]]. */
  priority?: number;
  /** @see [[PlanarClipMaskSettings.transparency]]. */
  transparency?: number;
}

/** Describes how to mask the geometry of one [GeometricModel]($backend) for display. The mask is produced by projecting geometry from any number of other models -
 * optionally filtered by [SubCategory]($backend) or by a set of specific [GeometricElement]($backend)s - onto a plane. Regions of the masked model that intersect the
 * mask are rendered partially or completely transparent. This is useful for, e.g., making subsurface geometry visible below the background map, or clipping out portions
 * of a reality model that intersect a design model.
 * @note Currently reality models (including background maps and terrain) can be masked, but design models can only produce masks.
 * @see [[DisplayStyleSettings.planarClipMasks]] to define clip masks for a [DisplayStyle]($backend).
 * @see [ContextRealityModelState.planarClipMask]($frontend) to apply a clip mask to a context reality model.
 * @public
 */
export class PlanarClipMaskSettings {
  /** Specifies how the mask geometry is produced. */
  public readonly mode: PlanarClipMaskMode;
  /** For any mode other than [[PlanarClipMaskMode.Priority]], the Ids of the [GeometricModel]($backend)s containing the geometry used to produce the mask.
   * If `undefined`, the set of all models in the view's [ModelSelector]($backend) is used.
   * The mask geometry can be filtered by [[subCategoryOrElementIds]].
   */
  public readonly modelIds?: CompressedId64Set;
  /** For [[PlanarClipMaskMode.IncludeElements]] or [[PlanarClipMaskMode.ExcludedElements]], the Ids of the [GeometricElement]($backend)s to include or exclude from masking;
   * for [[PlanarClipMaskMode.IncludeSubCategories]], the Ids of the subcategories whose geometry contributes to the mask.
   */
  public readonly subCategoryOrElementIds?: CompressedId64Set;
  /** For [[PlanarClipMaskMode.Priority]], the priority value. */
  public readonly priority?: number;
  /** A value between 0 and 1 indicating an override for mask transparency. A transparency of 0 (the default) indicates complete masking. 1 is completely transparent (no masking).
   If no transparency is defined then the transparencies of the mask elements are used.
   */
  public readonly transparency?: number;

  /** Create a new [[PlanarClipMaskSettings]] object from its JSON representation. */
  public static fromJSON(json?: PlanarClipMaskProps): PlanarClipMaskSettings {
    if (!json)
      return this.defaults;

    return new PlanarClipMaskSettings(json.mode, json.transparency, json.modelIds, json.subCategoryOrElementIds, json.priority);
  }

  /** Create settings for [[PlanarClipMaskMode.Models]]. */
  public static createForModels(modelIds: Iterable<Id64String> | undefined, transparency?: number): PlanarClipMaskSettings {
    return this.fromJSON({
      mode: PlanarClipMaskMode.Models,
      transparency,
      modelIds: modelIds ? CompressedId64Set.sortAndCompress(modelIds) : undefined,
    });
  }

  /** Create settings that filter by element or subcategory. */
  public static createForElementsOrSubCategories(mode: PlanarClipMaskMode.IncludeElements | PlanarClipMaskMode.ExcludeElements | PlanarClipMaskMode.IncludeSubCategories,
    elementOrSubCategoryIds: Iterable<Id64String>, modelIds?: Iterable<Id64String>, transparency?: number): PlanarClipMaskSettings {
    return this.fromJSON({
      mode,
      transparency,
      modelIds: modelIds ? CompressedId64Set.sortAndCompress(modelIds) : undefined,
      subCategoryOrElementIds: CompressedId64Set.sortAndCompress(elementOrSubCategoryIds),
    });
  }

  /** Create settings that mask by priority.
   * @see [[PlanarClipMaskPriority]] for default priority values based on model type.
   */
  public static createByPriority(priority: number, transparency?: number) {
    return new PlanarClipMaskSettings(PlanarClipMaskMode.Priority, transparency, undefined, undefined, priority);
  }

  /** Create JSON object representing this [[PlanarClipMaskSettings]] */
  public toJSON(): PlanarClipMaskProps {
    return { mode: this.mode, modelIds: this.modelIds, subCategoryOrElementIds: this.subCategoryOrElementIds, priority: this.priority, transparency: this.transparency  };
  }

  /** Returns true if masking is enabled. */
  public get isValid(): boolean {
    return this.mode !== PlanarClipMaskMode.None;
  }

  public equals(other: PlanarClipMaskSettings): boolean {
    return this.mode === other.mode &&
      this.priority === other.priority &&
      this.transparency === other.transparency &&
      this.modelIds === other.modelIds  &&
      this.subCategoryOrElementIds ===  other.subCategoryOrElementIds;
  }

  /** Create a copy of this TerrainSettings, optionally modifying some of its properties.
   * @param changedProps JSON representation of the properties to change.
   * @returns A TerrainSettings with all of its properties set to match those of`this`, except those explicitly defined in `changedProps`.
   */
  public clone(changedProps?: PlanarClipMaskProps): PlanarClipMaskSettings {
    if (undefined === changedProps)
      return this;

    const props = {
      mode: changedProps.mode ?? this.mode,
      transparency: changedProps.transparency ?? this.transparency,
      modelIds: changedProps.modelIds ?? this.modelIds,
      subCategoryOrElementIds: changedProps.subCategoryOrElementIds ?? this.subCategoryOrElementIds,
      priority: changedProps.priority ?? this.priority,
    };

    return PlanarClipMaskSettings.fromJSON(props);
  }

  private constructor(mode: PlanarClipMaskMode, transparency?: number, modelIds?: CompressedId64Set, subCategoryOrElementIds?: CompressedId64Set, priority?: number) {
    this.mode = mode;
    this.modelIds = modelIds;
    this.subCategoryOrElementIds = subCategoryOrElementIds;
    this.priority = priority;
    this.transparency = transparency;
  }

  /** A default PlanarClipMask which masks nothing. */
  public static defaults = new PlanarClipMaskSettings(PlanarClipMaskMode.None);
}

