/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  BeButton, BeButtonEvent, EventHandled, IModelApp, ViewTool, ViewHandleType, ViewManip,
} from "@bentley/imodeljs-frontend";

/** @packageDocumentation
 * @module Tools
 */

export class SelectAndNavigateTool extends ViewTool {
  public static toolId = "SelectAndNavigate";

  public async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (!ev.viewport)
      return EventHandled.No;

    let toolId: string;
    let handleId: ViewHandleType;

    switch (ev.button) {
      case BeButton.Data:
        toolId = "View.Pan";
        handleId = ViewHandleType.Pan;
        break;
      case BeButton.Reset:
        toolId = "View.Rotate";
        handleId = ViewHandleType.Rotate;
        break;
      case BeButton.Middle:
        toolId = "View.Zoom";
        handleId = ViewHandleType.Zoom;
        break;
    }

    const tool = IModelApp.tools.create(toolId, ev.viewport, true, true) as ViewManip | undefined;
    if (tool && tool.run())
      return tool.startHandleDrag(ev);

    return EventHandled.Yes;
  }

  public async onResetButtonUp(): Promise<EventHandled> {
    return EventHandled.Yes;
  }

  public exitTool(): void {
    // ###TODO remove this - for debugging
    super.exitTool();
  }
}
