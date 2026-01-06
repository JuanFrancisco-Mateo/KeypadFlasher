#include "configuration.h"
#include "src/userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"

const button_binding_t button_bindings[] = {
    {
        .pin = 33,
        .active_low = true,
        .led_index = -1,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = 'E',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    },
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = 'n',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    },
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = 't',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    },
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = 'e',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    },
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = 'r',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 5
            }
        }
    },
    {
        .pin = 32,
        .active_low = true,
        .led_index = 0,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '1',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    },
    {
        .pin = 14,
        .active_low = true,
        .led_index = 1,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '2',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    },
    {
        .pin = 15,
        .active_low = true,
        .led_index = 2,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '3',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    },
    {
        .pin = 16,
        .active_low = true,
        .led_index = 3,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '4',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    },
    {
        .pin = 17,
        .active_low = true,
        .led_index = 4,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '5',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    },
    {
        .pin = 11,
        .active_low = true,
        .led_index = 5,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_KEY,
                        .keycode = '6',
                        .modifiers = 0,
                        .hold_ms = 10,
                        .gap_ms = 10,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = 0
                    }
                },
                .length = 1
            }
        }
    }
};

const size_t button_binding_count = sizeof(button_bindings) / sizeof(button_bindings[0]);

const encoder_binding_t encoder_bindings[] = {
    {
        .pin_a = 31,
        .pin_b = 30,
        .clockwise = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_FUNCTION,
                        .keycode = 0,
                        .modifiers = 0,
                        .hold_ms = 0,
                        .gap_ms = 0,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = hid_consumer_volume_up
                    }
                },
                .length = 1
            }
        },
        .counter_clockwise = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .steps = {
                    {
                        .kind = HID_STEP_FUNCTION,
                        .keycode = 0,
                        .modifiers = 0,
                        .hold_ms = 0,
                        .gap_ms = 0,
                        .function_value = 1,
                        .pointer_type = 0,
                        .pointer_value = 0,
                        .functionPointer = hid_consumer_volume_down
                    }
                },
                .length = 1
            }
        }
    }
};

const size_t encoder_binding_count = sizeof(encoder_bindings) / sizeof(encoder_bindings[0]);
