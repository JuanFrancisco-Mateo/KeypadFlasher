#include "configuration.h"
#include "src/userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"

const button_binding_t button_bindings[] = {
    {
        .pin = 7,
        .active_low = true,
        .led_index = 0,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
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
        .pin = 8,
        .active_low = true,
        .led_index = 1,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
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
        .pin = 9,
        .active_low = true,
        .led_index = 2,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'c'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 10,
        .active_low = true,
        .led_index = 3,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'d'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 11,
        .active_low = true,
        .led_index = 4,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'e'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 12,
        .active_low = true,
        .led_index = 5,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'f'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 13,
        .active_low = true,
        .led_index = 6,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'g'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 14,
        .active_low = true,
        .led_index = 7,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'h'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 15,
        .active_low = true,
        .led_index = 8,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'i'},
                .length = 1,
                .delay = 0
            }
        }
    },
    {
        .pin = 16,
        .active_low = true,
        .led_index = 9,
        .bootloader_on_boot = false,
        .bootloader_chord_member = false,
        .function = {
            .type = HID_BINDING_SEQUENCE,
            .function.sequence = {
                .sequence = {'j'},
                .length = 1,
                .delay = 0
            }
        }
    }
};

const size_t button_binding_count = sizeof(button_bindings) / sizeof(button_bindings[0]);

const encoder_binding_t encoder_bindings[] = {
    {0}
};

const size_t encoder_binding_count = 0;
