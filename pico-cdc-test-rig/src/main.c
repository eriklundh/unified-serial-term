#include "bsp/board_api.h"
#include "tusb.h"

int main(void) {
    board_init();
    tusb_init();
    while (true) {
        tud_task();
    }
}
