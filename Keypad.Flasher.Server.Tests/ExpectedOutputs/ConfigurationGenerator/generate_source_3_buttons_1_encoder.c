#include "configuration.h"
#include "src/userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"

const button_binding_t button_bindings[] = {
    {
        .pin = 33,
        .active_low = true,
        .led_index = -1,
        .bootloader_on_boot = true,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'e', 'n', 't', 'e', 'r'},
                .length = 5,
                .delay = 5
            }
        }
    },
    {
        .pin = 16,
        .active_low = true,
        .led_index = 2,
        .bootloader_on_boot = false,
        .bootloader_chord_member = true,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'a'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 17,
        .active_low = true,
        .led_index = 1,
        .bootloader_on_boot = false,
        .bootloader_chord_member = true,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'b'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 11,
        .active_low = true,
        .led_index = 0,
        .bootloader_on_boot = false,
        .bootloader_chord_member = true,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'c'},
                .length = 1,
                .delay = 0
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
