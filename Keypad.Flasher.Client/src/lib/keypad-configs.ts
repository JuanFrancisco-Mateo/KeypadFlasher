export type HidBindingDto =
  | { type: "Sequence"; sequence: string; delay: number; functionPointer?: undefined }
  | { type: "Function"; sequence?: undefined; delay?: undefined; functionPointer: string };

export type ButtonBindingDto = {
  pin: number;
  activeLow: boolean;
  ledIndex: number;
  bootloaderOnBoot: boolean;
  bootloaderChordMember: boolean;
  function: HidBindingDto;
};

export type EncoderBindingDto = {
  pinA: number;
  pinB: number;
  clockwise: HidBindingDto;
  counterClockwise: HidBindingDto;
};

export type ConfigurationDto = {
  buttons: ButtonBindingDto[];
  encoders: EncoderBindingDto[];
  neoPixelPin: number;
  neoPixelReversed: boolean;
};

export type KnownDeviceConfig = { name: string; config: ConfigurationDto };

const seq = (sequence: string, delay = 0): HidBindingDto => ({ type: "Sequence", sequence, delay });
const func = (fn: string): HidBindingDto => ({ type: "Function", functionPointer: fn });

export const DEVICE_CONFIGS: Record<string, KnownDeviceConfig> = {
  "76-190-65-190": {
    name: "2 Keys",
    config: {
      buttons: [
        { pin: 32, activeLow: true, ledIndex: -1, bootloaderOnBoot: true, bootloaderChordMember: false, function: seq("1", 0) },
        { pin: 14, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: false, function: seq("2", 0) },
      ],
      encoders: [],
      neoPixelPin: -1,
      neoPixelReversed: false,
    },
  },
  "126-80-44-189": {
    name: "3 Keys 1 Knob",
    config: {
      buttons: [
        { pin: 33, activeLow: true, ledIndex: -1, bootloaderOnBoot: true, bootloaderChordMember: false, function: seq("enter", 5) },
        { pin: 16, activeLow: true, ledIndex: 2, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("a", 0) },
        { pin: 17, activeLow: true, ledIndex: 1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("b", 0) },
        { pin: 11, activeLow: true, ledIndex: 0, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("c", 0) },
      ],
      encoders: [
        { pinA: 31, pinB: 30, clockwise: func("hid_consumer_volume_up"), counterClockwise: func("hid_consumer_volume_down") },
      ],
      neoPixelPin: 34,
      neoPixelReversed: false,
    },
  },
  "49-174-205-190": {
    name: "4 Keys",
    config: {
      buttons: [
        { pin: 15, activeLow: true, ledIndex: 0, bootloaderOnBoot: true, bootloaderChordMember: true, function: seq("1", 0) },
        { pin: 16, activeLow: true, ledIndex: 1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("2", 0) },
        { pin: 17, activeLow: true, ledIndex: 2, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("3", 0) },
        { pin: 11, activeLow: true, ledIndex: 3, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("4", 0) },
      ],
      encoders: [],
      neoPixelPin: 34,
      neoPixelReversed: true,
    },
  },
  "144-165-233-190": {
    name: "6 Keys 1 Knob",
    config: {
      buttons: [
        { pin: 33, activeLow: true, ledIndex: -1, bootloaderOnBoot: true, bootloaderChordMember: false, function: seq("Enter", 0) },
        { pin: 32, activeLow: true, ledIndex: 0, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("1", 0) },
        { pin: 14, activeLow: true, ledIndex: 1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("2", 0) },
        { pin: 15, activeLow: true, ledIndex: 2, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("3", 0) },
        { pin: 16, activeLow: true, ledIndex: 3, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("4", 0) },
        { pin: 17, activeLow: true, ledIndex: 4, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("5", 0) },
        { pin: 11, activeLow: true, ledIndex: 5, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("6", 0) },
      ],
      encoders: [
        { pinA: 31, pinB: 30, clockwise: func("hid_consumer_volume_up"), counterClockwise: func("hid_consumer_volume_down") },
      ],
      neoPixelPin: 34,
      neoPixelReversed: true,
    },
  },
  "24-26-109-190": {
    name: "10 Keys",
    config: {
      buttons: [
        { pin: 32, activeLow: true, ledIndex: -1, bootloaderOnBoot: true, bootloaderChordMember: true, function: seq("0", 0) },
        { pin: 14, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("1", 0) },
        { pin: 15, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("2", 0) },
        { pin: 16, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("3", 0) },
        { pin: 17, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("4", 0) },
        { pin: 31, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("5", 0) },
        { pin: 30, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("6", 0) },
        { pin: 11, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("7", 0) },
        { pin: 33, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("8", 0) },
        { pin: 34, activeLow: true, ledIndex: -1, bootloaderOnBoot: false, bootloaderChordMember: true, function: seq("9", 0) },
      ],
      encoders: [],
      neoPixelPin: -1,
      neoPixelReversed: false,
    },
  },  
};

export function findConfigForBootloaderId(id: number[]): KnownDeviceConfig | null {
  const key = id.join("-");
  return DEVICE_CONFIGS[key] ?? null;
}
