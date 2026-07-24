// The published react-native-yamap-plus ships raw TS source (main: src/index.ts,
// no compiled output or .d.ts), and its internal useYamap hook doesn't satisfy
// RN 0.86's native-component types — so pulling in its real source breaks
// `tsc --noEmit` even though the native module compiles and runs fine.
//
// This ambient module (wired via tsconfig `paths`) gives our code accurate
// types for exactly the surface components/Map/index.tsx uses, without tsc
// descending into the library's broken source. Keep it in sync if we adopt
// more of the API.
declare module "react-native-yamap-plus" {
  import type { ComponentType, ReactNode, Ref } from "react";
  import type { StyleProp, ViewStyle } from "react-native";

  export interface Point {
    lat: number;
    lon: number;
  }

  export enum Animation {
    SMOOTH = 0,
    LINEAR = 1,
  }

  export interface InitialRegion {
    lat: number;
    lon: number;
    zoom?: number;
    azimuth?: number;
    tilt?: number;
  }

  export interface CameraPositionEvent {
    nativeEvent: { point: Point; zoom: number };
  }
  export interface MapPressEvent {
    nativeEvent: Point;
  }

  export interface YamapRef {
    setCenter: (
      center: Point,
      zoom?: number,
      azimuth?: number,
      tilt?: number,
      duration?: number,
      animation?: Animation,
    ) => void;
    fitMarkers: (points: Point[], duration?: number, animation?: Animation) => void;
    fitAllMarkers: (duration?: number, animation?: Animation) => void;
    setZoom: (zoom: number, duration?: number, animation?: Animation) => void;
  }

  export interface YamapProps {
    ref?: Ref<YamapRef>;
    style?: StyleProp<ViewStyle>;
    initialRegion?: InitialRegion;
    showUserPosition?: boolean;
    followUser?: boolean;
    nightMode?: boolean;
    mapType?: "none" | "raster" | "vector";
    onCameraPositionChange?: (e: CameraPositionEvent) => void;
    onCameraPositionChangeEnd?: (e: CameraPositionEvent) => void;
    onMapPress?: (e: MapPressEvent) => void;
    children?: ReactNode;
  }

  export interface MarkerProps {
    point: Point;
    anchor?: { x: number; y: number };
    scale?: number;
    rotated?: boolean;
    onPress?: () => void;
    children?: ReactNode;
  }

  export interface PolygonProps {
    points: Point[];
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
  }

  export interface PolylineProps {
    points: Point[];
    strokeColor?: string;
    strokeWidth?: number;
  }

  const Yamap: ComponentType<YamapProps>;
  export default Yamap;
  export const Marker: ComponentType<MarkerProps>;
  export const Polygon: ComponentType<PolygonProps>;
  export const Polyline: ComponentType<PolylineProps>;

  export const YamapInstance: {
    init: (apiKey: string) => Promise<void>;
    setLocale: (locale: string) => Promise<void>;
    getLocale: () => Promise<string>;
    resetLocale: () => Promise<void>;
  };
}
