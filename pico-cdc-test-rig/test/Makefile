CC     = gcc
CFLAGS = -Wall -Wextra -std=c11 -I..

.PHONY: all clean

all: test_ring_buffer test_report

test_ring_buffer: test_ring_buffer.c ../src/ring_buffer.c ../src/ring_buffer.h
	$(CC) $(CFLAGS) -o $@ test_ring_buffer.c ../src/ring_buffer.c && ./$@

test_report: test_report.c ../src/report.c ../src/report.h
	$(CC) $(CFLAGS) -o $@ test_report.c ../src/report.c && ./$@

clean:
	rm -f test_ring_buffer test_report
