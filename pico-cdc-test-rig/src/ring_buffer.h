#pragma once
#include <stdint.h>

typedef struct {
    uint8_t  *buf;
    uint32_t  cap;
    uint32_t  head;  // total bytes written (unbounded)
    uint32_t  tail;  // total bytes read (unbounded)
} ring_buf_t;

void     rb_init(ring_buf_t *rb, uint8_t *buf, uint32_t cap);
uint32_t rb_available(const ring_buf_t *rb);
uint32_t rb_free_space(const ring_buf_t *rb);
uint32_t rb_write(ring_buf_t *rb, const uint8_t *data, uint32_t len);
uint32_t rb_read(ring_buf_t *rb, uint8_t *data, uint32_t len);
