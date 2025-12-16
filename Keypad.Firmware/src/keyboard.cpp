#include <Arduino.h>
#include "userUsbHidKeyboardMouse/USBHIDKeyboardMouse.h"
#include "led.h"
#include "keyboard.h"
#include "../configuration.h"

static void keyboard_run_key_sequence(button_sequence_t sequence, keyboard_button_keyboard_mode_t mode)
{
  if (mode == BTM_RELEASE)
  {
    return;
  }

  for (uint8_t i = 0; i < sequence.length; i++)
  {
    Keyboard_press(sequence.sequence[i]);
    delay(10);
    if (sequence.delay > 0)
    {
      Keyboard_release(sequence.sequence[i]);
      delay(sequence.delay);
    }
  }
  Keyboard_releaseAll();
}

static void keyboard_run_mouse_sequence(button_mouse_t sequence, keyboard_button_keyboard_mode_t mode)
{
  if (mode == BTM_RELEASE)
  {
    return;
  }
  if (sequence.keypress > 0)
  {
    Keyboard_press(sequence.keypress);
    delay(30);
  }
  for (uint8_t i = 0; i < sequence.length; i++)
  {
    switch (sequence.mouse_event_sequence[i].type)
    {
    case UP:
      Mouse_move(0, -sequence.mouse_event_sequence[i].value);
      break;
    case DOWN:
      Mouse_move(0, sequence.mouse_event_sequence[i].value);
      break;
    case LEFT:
      Mouse_move(-sequence.mouse_event_sequence[i].value, 0);
      break;
    case RIGH:
      Mouse_move(sequence.mouse_event_sequence[i].value, 0);
      break;
    case LEFT_CLICK:
      Mouse_click(MOUSE_LEFT);
      break;
    case RIGHT_CLICK:
      Mouse_click(MOUSE_RIGHT);
      break;
    case SCROLL_UP:
      Mouse_scroll(sequence.mouse_event_sequence[i].value);
      break;
    case SCROLL_DOWN:
      Mouse_scroll(-sequence.mouse_event_sequence[i].value);
      break;
    default:
      break;
    }
    if (sequence.keypress > 0)
    {
      Keyboard_releaseAll();
    }
    delay(sequence.delay);
  }
}

void keyboard_press_button(keyboard_button_t button, keyboard_button_keyboard_mode_t mode)
{
  if (button >= BTN_1 && button <= BTN_3)
  {
    if (mode == BTM_PRESS)
    {
      led_presskey(button);
    }
    else
    {
      led_presskey(-1);
    }
  }

  switch (configuration.button[button].type)
  {
  case BUTTON_SEQUENCE:
    keyboard_run_key_sequence(configuration.button[button].function.sequence, mode);
    break;
  case BUTTON_MOUSE:
    keyboard_run_mouse_sequence(configuration.button[button].function.mouse, mode);
    break;
  case BUTTON_FUNCTION:
    configuration.button[button].function.functionPointer(mode);
    break;
  case BUTTON_NULL:
    break;
  default:
    break;
  }
}

