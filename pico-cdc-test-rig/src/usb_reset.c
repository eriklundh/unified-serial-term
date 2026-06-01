#include "tusb.h"
#include "device/usbd_pvt.h"
#include "pico/bootrom.h"

// Vendor interface that picotool uses to reboot a running Pico to BOOTSEL.
// Protocol matches pico-sdk/src/rp2_common/pico_stdio_usb/reset_interface.c
// (class=0xFF sub=0x00 proto=0x01) so picotool recognises it without VID filtering.

#define RESET_INTERFACE_SUBCLASS  0x00
#define RESET_INTERFACE_PROTOCOL  0x01
#define RESET_REQUEST_BOOTSEL     0x01

static uint8_t _itf_num;

static void      resetd_init(void) {}
static void      resetd_reset(uint8_t rhport) { (void)rhport; _itf_num = 0; }

static uint16_t resetd_open(uint8_t rhport, tusb_desc_interface_t const *desc_itf, uint16_t max_len) {
    (void)rhport;
    TU_VERIFY(TUSB_CLASS_VENDOR_SPECIFIC == desc_itf->bInterfaceClass &&
              RESET_INTERFACE_SUBCLASS   == desc_itf->bInterfaceSubClass &&
              RESET_INTERFACE_PROTOCOL   == desc_itf->bInterfaceProtocol, 0);
    uint16_t drv_len = sizeof(tusb_desc_interface_t);
    TU_VERIFY(max_len >= drv_len, 0);
    _itf_num = desc_itf->bInterfaceNumber;
    return drv_len;
}

static bool resetd_control_xfer_cb(uint8_t rhport, uint8_t stage,
                                    tusb_control_request_t const *request) {
    (void)rhport;
    if (stage != CONTROL_STAGE_SETUP) return true;
    if (request->wIndex != _itf_num) return false;

    if (request->bRequest == RESET_REQUEST_BOOTSEL) {
        reset_usb_boot(0, 0);
        // noreturn — device re-enumerates as BOOTSEL mass storage
    }
    return false;
}

static bool resetd_xfer_cb(uint8_t rhport, uint8_t ep_addr,
                            xfer_result_t result, uint32_t xferred_bytes) {
    (void)rhport; (void)ep_addr; (void)result; (void)xferred_bytes;
    return true;
}

static usbd_class_driver_t const _reset_driver = {
#if CFG_TUSB_DEBUG >= 2
    .name             = "RESET",
#endif
    .init             = resetd_init,
    .reset            = resetd_reset,
    .open             = resetd_open,
    .control_xfer_cb  = resetd_control_xfer_cb,
    .xfer_cb          = resetd_xfer_cb,
    .sof              = NULL,
};

usbd_class_driver_t const *usbd_app_driver_get_cb(uint8_t *driver_count) {
    *driver_count = 1;
    return &_reset_driver;
}
