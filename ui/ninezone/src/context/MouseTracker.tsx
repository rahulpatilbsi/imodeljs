/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
/** @module Utilities */

import * as React from "react";

export interface MouseTrackerProps {
  onCoordinatesChange?: (x: number, y: number) => void;
}

export default class MouseTracker extends React.Component<MouseTrackerProps> {
  public componentDidMount() {
    document.addEventListener("mousemove", this.handleMouseMove);
  }

  public componentWillUnmount() {
    document.removeEventListener("mousemove", this.handleMouseMove);
  }

  public render() {
    return null;
  }

  private handleMouseMove = (e: MouseEvent) => {
    this.changeCoordinates(e.clientX, e.clientY);
  }

  private changeCoordinates(x: number, y: number) {
    this.props.onCoordinatesChange && this.props.onCoordinatesChange(x, y);
  }
}
