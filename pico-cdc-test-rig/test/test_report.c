#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/report.h"

static void test_format_defaults(void) {
    rig_line_coding_t c = { .bit_rate = 115200, .data_bits = 8, .parity = 0, .stop_bits = 0 };
    char buf[128];
    int n = format_report(buf, sizeof(buf), &c, 1, 0);
    assert(n > 0);
    assert(strncmp(buf, "RIG ", 4) == 0);
    assert(strstr(buf, "baud=115200") != NULL);
    assert(strstr(buf, "data=8") != NULL);
    assert(strstr(buf, "parity=none") != NULL);
    assert(strstr(buf, "stop=1") != NULL);
    assert(strstr(buf, "dtr=1") != NULL);
    assert(strstr(buf, "rts=0") != NULL);
    assert(buf[n - 1] == '\n');
}

static void test_parity_odd(void) {
    rig_line_coding_t c = { .bit_rate = 9600, .data_bits = 7, .parity = 1, .stop_bits = 2 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 1);
    assert(strstr(buf, "parity=odd") != NULL);
    assert(strstr(buf, "stop=2") != NULL);
    assert(strstr(buf, "data=7") != NULL);
    assert(strstr(buf, "dtr=0") != NULL);
    assert(strstr(buf, "rts=1") != NULL);
}

static void test_parity_even(void) {
    rig_line_coding_t c = { .bit_rate = 38400, .data_bits = 8, .parity = 2, .stop_bits = 0 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 0);
    assert(strstr(buf, "parity=even") != NULL);
}

static void test_parity_mark(void) {
    rig_line_coding_t c = { .bit_rate = 4800, .data_bits = 8, .parity = 3, .stop_bits = 0 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 0);
    assert(strstr(buf, "parity=mark") != NULL);
}

static void test_parity_space(void) {
    rig_line_coding_t c = { .bit_rate = 2400, .data_bits = 8, .parity = 4, .stop_bits = 0 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 0);
    assert(strstr(buf, "parity=space") != NULL);
}

static void test_stop_1_5(void) {
    rig_line_coding_t c = { .bit_rate = 1200, .data_bits = 5, .parity = 0, .stop_bits = 1 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 0);
    assert(strstr(buf, "stop=1.5") != NULL);
    assert(strstr(buf, "data=5") != NULL);
}

static void test_baud_preserved(void) {
    rig_line_coding_t c = { .bit_rate = 921600, .data_bits = 8, .parity = 0, .stop_bits = 0 };
    char buf[128];
    format_report(buf, sizeof(buf), &c, 0, 0);
    assert(strstr(buf, "baud=921600") != NULL);
}

int main(void) {
    test_format_defaults();
    test_parity_odd();
    test_parity_even();
    test_parity_mark();
    test_parity_space();
    test_stop_1_5();
    test_baud_preserved();
    printf("All report formatter tests passed.\n");
    return 0;
}
