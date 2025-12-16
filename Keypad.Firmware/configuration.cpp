#include "configuration.h"
#include "src/userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"

const keyboard_configuration_t configuration = {
    .button = {
        [BTN_1] = {
            .type = BUTTON_SEQUENCE,
            .function.sequence = {
                .sequence = {KEY_LEFT_CTRL, 'c'},
                .length = 2,
                .delay = 0
            }
        },
        [BTN_2] = {
            .type = BUTTON_SEQUENCE,
            .function.sequence = {
                .sequence = {KEY_LEFT_CTRL, 'v'},
                .length = 2,
                .delay = 0
            }
        },
        [BTN_3] = {
            .type = BUTTON_SEQUENCE,
            .function.sequence = {
                .sequence = {KEY_LEFT_CTRL, 'z'},
                .length = 2,
                .delay = 0
            }
        },
        [ENC_CW] = {
            .type = BUTTON_MOUSE,
            .function.mouse = {
                .mouse_event_sequence = {
                    {
                        .type = SCROLL_DOWN,
                        .value = 2
                    }
                },
                .length = 1,
                .delay = 0,
                .keypress = 0
            }
        },
        [ENC_CCW] = {
            .type = BUTTON_MOUSE,
            .function.mouse = {
                .mouse_event_sequence = {
                    {
                        .type = SCROLL_UP,
                        .value = 2
                    }
                },
                .length = 1,
                .delay = 0,
                .keypress = 0
            }
        },
        [BTN_ENC] = {
            .type = BUTTON_NULL,
        },
    }
};