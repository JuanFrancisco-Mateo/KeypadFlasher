#include <Arduino.h>
#include <stdbool.h>
#include "../configuration.h"
#include "led.h"

#if !CONFIGURATION_DEBUG_MODE && NEO_COUNT > 0
#ifndef NEO_REVERSED
#define NEO_REVERSED 0
#endif
#include "neo/neo.h"

static const led_configuration_t *led_cfg_s = &led_configuration;
static uint8_t color_hue_s[NEO_COUNT] = {0}; // hue value: 0..191 color map
static bool pressed_s[NEO_COUNT] = {0};      // pressed state per logical LED
static const uint8_t LED_LOOP_STEP_INTERVAL_MS = 20;
static uint32_t last_loop_step_ms_s = 0;

static uint8_t led_count(void)
{
  return led_cfg_s->count;
}

static uint8_t led_physical_index(uint8_t logical)
{
  // Map logical LED ordering to physical wiring when reversed.
  return NEO_REVERSED ? (uint8_t)(NEO_COUNT - 1 - logical) : logical;
}

void led_set_color_hue(uint8_t led0, uint8_t led1, uint8_t led2)
{
  const uint8_t hues[3] = {led0, led1, led2};
  const uint8_t count = led_count();
  for (uint8_t i = 0; i < count; ++i)
  {
    color_hue_s[i] = hues[i % 3];
  }
}

void led_show_bootloader_indicator(void)
{
  const uint8_t count = led_count();
  for (uint8_t i = 0; i < count; ++i)
  {
    const uint8_t physical = led_physical_index(i);
    NEO_writeHue(physical, NEO_BLUE, NEO_BRIGHT_KEYS);
  }
  NEO_update();
}

void led_set_mode(enum led_keyboard_mode_t mode)
{
  (void)mode; // mode is kept for backward compatibility; config drives behavior.
  const uint8_t hues[3] = {NEO_RED, NEO_YEL, NEO_GREEN};
  const uint8_t count = led_count();
  for (uint8_t i = 0; i < count; ++i)
  {
    color_hue_s[i] = hues[i % 3];
    pressed_s[i] = false;
  }
  last_loop_step_ms_s = millis();
}

void led_set_key_state(int key, bool pressed)
{
  const uint8_t count = led_count();
  if (key < 0 || key >= (int)count)
  {
    return;
  }
  pressed_s[key] = pressed;
}

void led_update()
{
  if (led_cfg_s->passive_mode == LED_PASSIVE_RAINBOW)
  {
    const uint32_t now = millis();
    if ((uint32_t)(now - last_loop_step_ms_s) >= LED_LOOP_STEP_INTERVAL_MS)
    {
      last_loop_step_ms_s = now;
      for (uint8_t i = 0; i < NEO_COUNT; ++i)
      {
        color_hue_s[i] += 1;
        if (color_hue_s[i] > 191)
        {
          color_hue_s[i] = 0;
        }
      }
    }
  }

  const uint8_t count = led_count();
  for (uint8_t led = 0; led < count; ++led)
  {
    const uint8_t physical = led_physical_index(led);
    if (pressed_s[led])
    {
      const led_active_mode_t mode = led_cfg_s->active_modes[led];
      if (mode == LED_ACTIVE_SOLID)
      {
        const led_rgb_t *color = &led_cfg_s->active_colors[led];
        NEO_writeColor(physical, color->r, color->g, color->b);
        continue;
      }
      if (mode == LED_ACTIVE_OFF)
      {
        NEO_writeColor(physical, 0, 0, 0);
        continue;
      }
    }

    switch (led_cfg_s->passive_mode)
    {
    case LED_PASSIVE_OFF:
      NEO_writeColor(physical, 0, 0, 0);
      break;
    case LED_PASSIVE_STATIC:
      {
        const led_rgb_t *color = &led_cfg_s->passive_colors[led];
        NEO_writeColor(physical, color->r, color->g, color->b);
      }
      break;
    case LED_PASSIVE_RAINBOW:
    default:
      NEO_writeHue(physical, color_hue_s[led], NEO_BRIGHT_KEYS);
      break;
    }
  }

  NEO_update();
}
#endif