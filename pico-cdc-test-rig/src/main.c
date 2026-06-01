#include "pico/stdlib.h"

int main(void) {
#ifdef PICO_DEFAULT_LED_PIN
    const uint LED = PICO_DEFAULT_LED_PIN;
    gpio_init(LED);
    gpio_set_dir(LED, GPIO_OUT);
    while (true) {
        gpio_put(LED, 1);
        sleep_ms(250);
        gpio_put(LED, 0);
        sleep_ms(250);
    }
#else
    while (true) { tight_loop_contents(); }
#endif
}
