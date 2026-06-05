#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    uint32_t bit_rate;
    uint8_t  stop_bits;  // 0=1, 1=1.5, 2=2
    uint8_t  parity;     // 0=none 1=odd 2=even 3=mark 4=space
    uint8_t  data_bits;
} rig_line_coding_t;

// Format "RIG baud=N data=N parity=X stop=X dtr=N rts=N\n" into buf.
// Returns number of bytes written (excluding null terminator).
// buf must be at least 80 bytes.
int format_report(char *buf, int buflen,
                  const rig_line_coding_t *coding, bool dtr, bool rts);
