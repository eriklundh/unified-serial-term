#include "bsp/board_api.h"
#include "tusb.h"
#include "ring_buffer.h"
#include "report.h"

// Two-byte sentinel: host sends 0x01 0x3F to request the settings report.
// Everything else echoes normally.
#define SENTINEL_BYTE0  0x01
#define SENTINEL_BYTE1  0x3F

static uint8_t    _rb_storage[256];
static ring_buf_t _tx_rb;

static rig_line_coding_t _line_coding = {
    .bit_rate  = 115200,
    .data_bits = 8,
    .parity    = 0,
    .stop_bits = 0,
};
static bool _dtr = false;
static bool _rts = false;

// Sentinel parser state: did we just see 0x01?
static bool _sentinel_armed = false;

// ---- TinyUSB callbacks ------------------------------------------------

void tud_cdc_line_coding_cb(uint8_t itf, cdc_line_coding_t const *coding) {
    (void)itf;
    _line_coding.bit_rate  = coding->bit_rate;
    _line_coding.data_bits = coding->data_bits;
    _line_coding.parity    = coding->parity;
    _line_coding.stop_bits = coding->stop_bits;
}

void tud_cdc_line_state_cb(uint8_t itf, bool dtr, bool rts) {
    (void)itf;
    _dtr = dtr;
    _rts = rts;
    board_led_write(dtr);
}

// ---- CDC service -------------------------------------------------------

static void send_report(void) {
    char report[128];
    int n = format_report(report, sizeof(report), &_line_coding, _dtr, _rts);
    if (n > 0) {
        tud_cdc_write(report, (uint32_t)n);
        tud_cdc_write_flush();
    }
}

static void process_byte(uint8_t b) {
    if (_sentinel_armed) {
        _sentinel_armed = false;
        if (b == SENTINEL_BYTE1) {
            send_report();
            return;
        }
        // False alarm: echo the sentinel prefix byte then fall through to echo b
        uint8_t s0 = SENTINEL_BYTE0;
        rb_write(&_tx_rb, &s0, 1);
    }

    if (b == SENTINEL_BYTE0) {
        _sentinel_armed = true;
    } else {
        rb_write(&_tx_rb, &b, 1);
    }
}

static void cdc_service(void) {
    if (!tud_cdc_connected()) return;

    uint32_t avail = tud_cdc_available();
    if (avail > 0) {
        uint8_t rx[64];
        uint32_t n = tud_cdc_read(rx, sizeof(rx));
        for (uint32_t i = 0; i < n; i++)
            process_byte(rx[i]);
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
