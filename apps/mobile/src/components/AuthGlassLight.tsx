import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  SensorType,
  useAnimatedProps,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * Silhouette of the glass P in `auth-hero.jpg`, in the render's own
 * 1024×1536 pixel space (potrace of the lavender pixels). Regenerate it if the
 * render changes, or the light will spill off the glass.
 */
const GLASS_P =
  "M361 228 L358 231 L349 231 L331 230 L321 231 L317 233 L315 236 L313 238 L310 239 L307 241 L304 245 L302 270 L302 482 L302 706 L304 750 L305 760 L307 761 L310 756 L317 743 L332 713 L360 667 L390 633 L422 608 L457 592 L502 581 L536 573 L556 567 L568 561 L574 558 L580 556 L589 551 L595 539 L594 522 L592 514 L592 505 L593 499 L593 497 L592 495 L589 491 L589 487 L593 482 L605 475 L626 466 L658 455 L690 442 L710 429 L716 424 L719 422 L723 421 L728 419 L732 416 L736 413 L739 410 L743 408 L746 407 L751 404 L755 401 L758 399 L761 397 L762 397 L764 397 L765 397 L766 396 L767 395 L768 392 L770 386 L767 376 L755 348 L723 303 L680 269 L645 253 L613 245 L585 242 L578 242 L573 241 L571 241 L570 241 L568 242 L565 244 L560 244 L557 242 L554 241 L552 240 L549 239 L547 239 L545 238 L542 237 L529 236 L502 234 L490 233 L477 232 L465 231 L452 230 L440 229 L430 228 L420 228 L410 227 L401 226 L389 226 L364 225Z" +
  "M770 410 L761 417 L754 422 L750 424 L746 427 L744 432 L738 442 L724 457 L712 466 L710 467 L708 468 L704 471 L694 476 L681 482 L656 494 L640 511 L643 531 L651 551 L649 569 L641 584 L636 588 L625 596 L606 606 L579 617 L543 628 L504 640 L474 653 L440 674 L394 713 L352 759 L334 782 L329 787 L325 787 L323 787 L320 792 L316 799 L312 804 L309 807 L304 827 L304 866 L306 881 L312 887 L315 889 L318 891 L322 893 L330 895 L338 896 L341 896 L344 896 L347 897 L351 898 L356 898 L360 898 L364 899 L369 901 L374 903 L380 905 L386 906 L391 907 L394 908 L396 908 L398 909 L400 910 L405 911 L416 913 L431 917 L439 917 L445 916 L450 912 L456 912 L460 917 L461 919 L464 921 L470 922 L483 922 L493 918 L499 913 L508 910 L516 912 L520 914 L523 912 L525 907 L529 902 L537 901 L546 901 L550 901 L553 904 L556 906 L560 907 L567 908 L572 907 L571 902 L568 898 L566 897 L562 896 L553 894 L546 892 L542 890 L538 889 L532 888 L527 887 L521 887 L518 886 L515 885 L510 885 L503 885 L495 882 L493 875 L494 868 L495 864 L495 860 L494 857 L494 854 L494 846 L495 785 L496 728 L498 720 L504 719 L519 719 L590 714 L652 690 L686 663 L695 655 L703 649 L707 648 L710 646 L712 644 L714 643 L716 642 L720 641 L726 638 L732 633 L738 625 L744 617 L746 612 L748 610 L750 607 L753 602 L762 585 L770 565 L780 527 L785 478 L779 425 L776 412 L773 408Z";

/** Horizontal centre of the P in render space; the sheen sweeps around it. */
const P_CENTER_X = 540;
/** Tilt (as a fraction of g) that pushes the light fully to one side. */
const FULL_TILT = 0.45;
/** Phone pitch (radians) at which the light sits at its resting height. */
const RESTING_PITCH = Math.PI / 4;
/** Per-frame easing toward the sensor reading; lower is floatier. */
const FOLLOW = 0.08;

type AuthGlassLightProps = {
  reducedMotion: boolean;
};

/**
 * Live light over the pre-rendered glass P. Phone tilt (gravity sensor)
 * moves a specular sheen across the glass, brightens the rim facing the
 * light, and slides a violet caustic across the floor the opposite way.
 * Shares the hero image's `cover` framing via `xMidYMid slice`.
 */
export function AuthGlassLight({ reducedMotion }: AuthGlassLightProps) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY);
  // -1 = light from the left, 1 = from the right; pitch -1..1 = low..high.
  const light = useSharedValue(0.35);
  const pitch = useSharedValue(0);

  const frame = useFrameCallback(({ timeSinceFirstFrame }) => {
    "worklet";
    const { x, y, z } = gravity.sensor.value;
    const magnitude = Math.hypot(x, y, z);
    let targetLight: number;
    let targetPitch: number;
    if (magnitude > 1) {
      targetLight = Math.max(-1, Math.min(1, -x / magnitude / FULL_TILT));
      const tiltBack = Math.atan2(Math.abs(z), Math.abs(y)) - RESTING_PITCH;
      targetPitch = Math.max(-1, Math.min(1, tiltBack / (Math.PI / 6)));
    } else {
      // No sensor reading (emulator, unsupported device): orbit slowly.
      targetLight = Math.sin(timeSinceFirstFrame / 2600) * 0.7;
      targetPitch = Math.sin(timeSinceFirstFrame / 4100) * 0.4;
    }
    light.value += (targetLight - light.value) * FOLLOW;
    pitch.value += (targetPitch - pitch.value) * FOLLOW;
  }, false);

  useEffect(() => {
    frame.setActive(!reducedMotion);
    return () => frame.setActive(false);
  }, [frame, reducedMotion]);

  const sheenProps = useAnimatedProps(() => ({
    x: P_CENTER_X - 260 + light.value * 260,
    y: 120 - pitch.value * 90,
  }));
  const rimLeftProps = useAnimatedProps(() => ({
    strokeOpacity: 0.2 + Math.max(0, -light.value) * 0.7,
  }));
  const rimRightProps = useAnimatedProps(() => ({
    strokeOpacity: 0.2 + Math.max(0, light.value) * 0.7,
  }));
  const causticProps = useAnimatedProps(() => ({
    cx: P_CENTER_X + 60 - light.value * 170,
    ry: 34 + pitch.value * 8,
  }));

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 1024 1536"
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs>
        <ClipPath id="glassP">
          <Path d={GLASS_P} fillRule="evenodd" />
        </ClipPath>
        <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <Stop offset="0.36" stopColor="#ffffff" stopOpacity="0.08" />
          <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="0.56" stopColor="#ffffff" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="rimLeft" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="rimRight" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0.65" stopColor="#ffffff" stopOpacity="0" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="1" />
        </LinearGradient>
        <RadialGradient id="caustic" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#9b7bff" stopOpacity="0.32" />
          <Stop offset="0.6" stopColor="#b9a3ff" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#b9a3ff" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <AnimatedEllipse
        animatedProps={causticProps}
        cx={P_CENTER_X}
        cy={950}
        rx={230}
        ry={34}
        fill="url(#caustic)"
      />

      <G clipPath="url(#glassP)">
        <G rotation={-24} originX={P_CENTER_X} originY={560}>
          <AnimatedRect
            animatedProps={sheenProps}
            x={P_CENTER_X - 260}
            y={120}
            width={520}
            height={900}
            fill="url(#sheen)"
          />
        </G>
        {/* Stroke is centred on the outline; the clip keeps only the inner
            half, so it reads as light catching the bevel. */}
        <AnimatedPath
          animatedProps={rimLeftProps}
          d={GLASS_P}
          fill="none"
          stroke="url(#rimLeft)"
          strokeWidth={14}
        />
        <AnimatedPath
          animatedProps={rimRightProps}
          d={GLASS_P}
          fill="none"
          stroke="url(#rimRight)"
          strokeWidth={14}
        />
      </G>
    </Svg>
  );
}
