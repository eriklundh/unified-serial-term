#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/ring_buffer.h"

static uint8_t buf[256];
static ring_buf_t rb;

static void test_init_empty(void) {
    rb_init(&rb, buf, sizeof(buf));
    assert(rb_available(&rb) == 0);
    assert(rb_free_space(&rb) == 256);
}

static void test_write_read_single(void) {
    rb_init(&rb, buf, sizeof(buf));
    uint8_t in = 0xAB, out = 0;
    assert(rb_write(&rb, &in, 1) == 1);
    assert(rb_available(&rb) == 1);
    assert(rb_read(&rb, &out, 1) == 1);
    assert(out == 0xAB);
    assert(rb_available(&rb) == 0);
}

static void test_write_read_sequential(void) {
    rb_init(&rb, buf, sizeof(buf));
    uint8_t in[4] = {1, 2, 3, 4};
    uint8_t out[4] = {0};
    assert(rb_write(&rb, in, 4) == 4);
    assert(rb_read(&rb, out, 4) == 4);
    assert(memcmp(in, out, 4) == 0);
}

static void test_full_buffer(void) {
    rb_init(&rb, buf, sizeof(buf));
    uint8_t in[256];
    for (int i = 0; i < 256; i++) in[i] = (uint8_t)i;
    assert(rb_write(&rb, in, 256) == 256);
    assert(rb_free_space(&rb) == 0);
    uint8_t extra = 0xFF;
    assert(rb_write(&rb, &extra, 1) == 0);
}

static void test_empty_read(void) {
    rb_init(&rb, buf, sizeof(buf));
    uint8_t out;
    assert(rb_read(&rb, &out, 1) == 0);
}

static void test_partial_write(void) {
    rb_init(&rb, buf, sizeof(buf));
    // Fill all but 10 bytes
    uint8_t filler[246] = {0};
    assert(rb_write(&rb, filler, 246) == 246);
    uint8_t more[20] = {0};
    // Only 10 slots remain — partial write
    assert(rb_write(&rb, more, 20) == 10);
}

static void test_wrap_around(void) {
    rb_init(&rb, buf, sizeof(buf));
    uint8_t in[200], out[200];
    for (int i = 0; i < 200; i++) in[i] = (uint8_t)(i & 0xFF);

    // Write and drain 200 bytes to advance internal indices past buffer end
    assert(rb_write(&rb, in, 200) == 200);
    assert(rb_read(&rb, out, 200) == 200);
    assert(memcmp(in, out, 200) == 0);

    // Write 200 more — this wraps the head pointer
    for (int i = 0; i < 200; i++) in[i] = (uint8_t)((i + 1) & 0xFF);
    assert(rb_write(&rb, in, 200) == 200);
    assert(rb_read(&rb, out, 200) == 200);
    assert(memcmp(in, out, 200) == 0);
    assert(rb_available(&rb) == 0);
}

static void test_order_preserved(void) {
    rb_init(&rb, buf, sizeof(buf));
    for (uint8_t i = 0; i < 100; i++)
        assert(rb_write(&rb, &i, 1) == 1);
    for (uint8_t i = 0; i < 100; i++) {
        uint8_t out;
        assert(rb_read(&rb, &out, 1) == 1);
        assert(out == i);
    }
}

int main(void) {
    test_init_empty();
    test_write_read_single();
    test_write_read_sequential();
    test_full_buffer();
    test_empty_read();
    test_partial_write();
    test_wrap_around();
    test_order_preserved();
    printf("All ring buffer tests passed.\n");
    return 0;
}
