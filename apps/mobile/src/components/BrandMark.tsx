import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 22 }: BrandMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="pravah-brand-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1a1530" />
          <Stop offset="0.6" stopColor="#0f0a1f" />
          <Stop offset="1" stopColor="#070510" />
        </LinearGradient>
        <LinearGradient id="pravah-brand-accent" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#a78bfa" />
          <Stop offset="1" stopColor="#7c5cff" />
        </LinearGradient>
      </Defs>

      <Rect width="64" height="64" rx="14" fill="url(#pravah-brand-bg)" />
      <Path
        d="M0 16h64M0 32h64M0 48h64M16 0v64M32 0v64M48 0v64"
        stroke="#ffffff"
        strokeOpacity="0.06"
        strokeWidth="0.5"
      />
      <Path
        d="M4 46 C 14 34, 22 56, 32 44 S 50 34, 60 46"
        stroke="url(#pravah-brand-accent)"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M4 52 C 14 42, 22 60, 32 50 S 50 42, 60 52"
        stroke="#a78bfa"
        strokeOpacity="0.4"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="46" cy="18" r="6" fill="url(#pravah-brand-accent)" />
      <Circle cx="46" cy="18" r="2" fill="#ffffff" />
    </Svg>
  );
}
