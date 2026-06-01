#include "bsp/board_api.h"
#include "tusb.h"
#include "ring_buffer.h"

static uint8_t _rb_storage[256];
static ring_buf_t _tx_rb;

static void cdc_service(void) {
    if (!tud_cdc_connected()) return;

    uint32_t avail = tud_cdc_available();
    if (avail > 0) {
        uint8_t rx[64];
        uint32_t n = tud_cdc_read(rx, sizeof(rx));
        rb_write(&_tx_rb, rx, n);
    }

    uint32_t room = tud_cdc_write_available();
    while (rb_available(&_tx_rb) > 0 && room > 0) {
        uint8_t out[64];
        uint32_t to_send = rb_available(&_tx_rb);
        if (to_send > room) to_send = room;
        if (to_send > sizeof(out)) to_send = sizeof(out);
        uint32_t got = rb_read(&_tx_rb, out, to_send);
        tud_cdc_write(out, got);
        room -= got;
    }

    if (rb_available(&_tx_rb) == 0)
        tud_cdc_write_flush();
}

int main(void) {
    board_init();
    rb_init(&_tx_rb, _rb_storage, sizeof(_rb_storage));
    tusb_init();
    while (true) {
        tud_task();
        cdc_service();
    }
}
