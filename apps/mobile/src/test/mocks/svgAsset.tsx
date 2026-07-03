import React from "react";

type SvgAssetProps = {
  children?: React.ReactNode;
};

export default function SvgAsset({ children }: SvgAssetProps) {
  return React.createElement("svg", {}, children);
}
