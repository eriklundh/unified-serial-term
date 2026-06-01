cmake_minimum_required(VERSION 3.13)

# Must come before project()
include(pico_sdk_import.cmake)

project(pico-cdc-test-rig C CXX ASM)

pico_sdk_init()

add_executable(pico-cdc-test-rig
    src/main.c
)

target_link_libraries(pico-cdc-test-rig
    pico_stdlib
)

# Produce .uf2, .bin, .hex, .dis alongside the .elf
pico_add_extra_outputs(pico-cdc-test-rig)
