#include "ring_buffer.h"

void rb_init(ring_buf_t *rb, uint8_t *buf, uint32_t cap) {
    rb->buf  = buf;
    rb->cap  = cap;
    rb->head = 0;
    rb->tail = 0;
}

uint32_t rb_available(const ring_buf_t *rb) {
    return rb->head - rb->tail;
}

uint32_t rb_free_space(const ring_buf_t *rb) {
    return rb->cap - (rb->head - rb->tail);
}

uint32_t rb_write(ring_buf_t *rb, const uint8_t *data, uint32_t len) {
    uint32_t space = rb_free_space(rb);
    if (len > space) len = space;
    for (uint32_t i = 0; i < len; i++) {
        rb->buf[rb->head % rb->cap] = data[i];
        rb->head++;
    }
    return len;
}

uint32_t rb_read(ring_buf_t *rb, uint8_t *data, uint32_t len) {
    uint32_t avail = rb_available(rb);
    if (len > avail) len = avail;
    for (uint32_t i = 0; i < len; i++) {
        data[i] = rb->buf[rb->tail % rb->cap];
        rb->tail++;
    }
    return len;
}
