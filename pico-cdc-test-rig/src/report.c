#include "report.h"
#include <stdio.h>

static const char *parity_str(uint8_t p) {
    switch (p) {
        case 0: return "none";
        case 1: return "odd";
        case 2: return "even";
        case 3: return "mark";
        case 4: return "space";
        default: return "?";
    }
}

static const char *stop_str(uint8_t s) {
    switch (s) {
        case 0: return "1";
        case 1: return "1.5";
        case 2: return "2";
        default: return "?";
    }
}

int format_report(char *buf, int buflen,
                  const rig_line_coding_t *coding, bool dtr, bool rts) {
    return snprintf(buf, (size_t)buflen,
                    "RIG baud=%lu data=%u parity=%s stop=%s dtr=%d rts=%d\n",
                    (unsigned long)coding->bit_rate,
                    (unsigned)coding->data_bits,
                    parity_str(coding->parity),
                    stop_str(coding->stop_bits),
                    dtr ? 1 : 0,
                    rts ? 1 : 0);
}
