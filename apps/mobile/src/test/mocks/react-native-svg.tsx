import React from "react";

type Props = {
  children?: React.ReactNode;
};

export default function Svg({ children }: Props) {
  return React.createElement("svg", {}, children);
}

function Shape() {
  return React.createElement("span");
}

export const Circle = Shape;
export const Defs = Shape;
export const G = Shape;
export const Line = Shape;
export const LinearGradient = Shape;
export const Path = Shape;
export const Pattern = Shape;
export const RadialGradient = Shape;
export const Rect = Shape;
export const Stop = Shape;
export const Text = Shape;
