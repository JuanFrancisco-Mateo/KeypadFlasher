#include "configuration.h"
#include "src/userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"

const button_binding_t button_bindings[] = {
    {
        .pin = 1,
        .active_low = true,
        .led_index = 0,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'1'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 2,
        .active_low = true,
        .led_index = 1,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'2'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 3,
        .active_low = true,
        .led_index = 2,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'3'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 4,
        .active_low = false,
        .led_index = 3,
        .bootloader_on_boot = true,
        .bootloader_chord_member = true,
        .function = {
            .type = HID_BINDING_FUNCTION,
            .function.functionPointer = hid_consumer_volume_down
        }
    },
    {
        .pin = 5,
        .active_low = false,
        .led_index = 4,
        .bootloader_on_boot = false,
        .bootloader_chord_member = true,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'T', 'a', 'b'},
                .length = 3,
                .delay = 1
            }
        }
    },
    {
        .pin = 6,
        .active_low = true,
        .led_index = -1,
        .bootloader_on_boot = true,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_FUNCTION,
            .function.functionPointer = hid_consumer_volume_up
        }
    }
};

const size_t button_binding_count = sizeof(button_bindings) / sizeof(button_bindings[0]);

const encoder_binding_t encoder_bindings[] = {
    {
        .pin_a = 20,
        .pin_b = 21,
        .clockwise = {
            .type = HID_BINDING_FUNCTION,
            .function.functionPointer = hid_consumer_volume_up
        },
        .counter_clockwise = {
            .type = HID_BINDING_FUNCTION,
            .function.functionPointer = hid_consumer_volume_down
        }
    }
};

const size_t encoder_binding_count = sizeof(encoder_bindings) / sizeof(encoder_bindings[0]);
