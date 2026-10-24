// CSI receiver: ESP32-S3 connects to the csi_tx access point, pings it
// 100 times per second, and prints the CSI of every reply over serial.
//
// Output line format (one per packet):
//   CSI,<seq>,<rssi>,<timestamp_us>,<len>,<v0> <v1> ... <v(len-1)>
// Values are int8 pairs per subcarrier: imaginary, real, imaginary, real, ...
// With only L-LTF enabled there are 64 subcarriers -> len = 128.

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "ping/ping_sock.h"
#include "lwip/ip_addr.h"
#include "driver/uart.h"

// Must match csi_tx/src/main.c
#define AP_SSID      "CSI_AP"
#define AP_PASS      "csi12345"
#define PING_RATE_HZ 100
#define CSI_MAX_LEN  384

static const char *TAG = "csi_rx";

typedef struct {
    int8_t   rssi;
    uint32_t timestamp;
    uint16_t len;
    int8_t   buf[CSI_MAX_LEN];
} csi_frame_t;

static QueueHandle_t s_csi_queue;
static uint8_t s_ap_bssid[6];
static bool s_csi_started = false;
static volatile uint32_t s_dropped = 0;

// Runs inside the Wi-Fi task: keep it short, just copy and queue.
static void wifi_csi_cb(void *ctx, wifi_csi_info_t *info)
{
    if (!info || !info->buf) return;
    if (memcmp(info->mac, s_ap_bssid, 6) != 0) return;   // only packets from our AP

    csi_frame_t f;
    f.rssi = info->rx_ctrl.rssi;
    f.timestamp = info->rx_ctrl.timestamp;
    f.len = info->len > CSI_MAX_LEN ? CSI_MAX_LEN : info->len;
    memcpy(f.buf, info->buf, f.len);
    if (info->first_word_invalid) memset(f.buf, 0, 4);

    if (xQueueSend(s_csi_queue, &f, 0) != pdTRUE) s_dropped++;
}

// Prints queued CSI frames to serial.
static void csi_print_task(void *arg)
{
    static char line[CSI_MAX_LEN * 5 + 64];
    csi_frame_t f;
    uint32_t seq = 0;

    while (1) {
        if (xQueueReceive(s_csi_queue, &f, portMAX_DELAY) != pdTRUE) continue;
        int n = snprintf(line, sizeof(line), "CSI,%lu,%d,%lu,%u,",
                         (unsigned long)seq++, f.rssi, (unsigned long)f.timestamp, f.len);
        for (int i = 0; i < f.len && n < (int)sizeof(line) - 6; i++) {
            n += snprintf(line + n, sizeof(line) - n, i ? " %d" : "%d", f.buf[i]);
        }
        line[n++] = '\n';
        line[n] = '\0';
        fputs(line, stdout);
    }
}

static void start_csi(void)
{
    wifi_csi_config_t csi_cfg = {
        .lltf_en = true,            // legacy LTF: 64 subcarriers, present in every packet
        .htltf_en = false,          // keep it simple and fixed-length for now
        .stbc_htltf2_en = false,
        .ltf_merge_en = true,
        .channel_filter_en = false,
        .manu_scale = false,
        .shift = 0,
    };
    ESP_ERROR_CHECK(esp_wifi_set_csi_config(&csi_cfg));
    ESP_ERROR_CHECK(esp_wifi_set_csi_rx_cb(wifi_csi_cb, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_csi(true));
}

static void start_ping(void)
{
    esp_ping_config_t cfg = ESP_PING_DEFAULT_CONFIG();
    IP_ADDR4(&cfg.target_addr, 192, 168, 4, 1);     // the AP's address
    cfg.count = ESP_PING_COUNT_INFINITE;
    cfg.interval_ms = 1000 / PING_RATE_HZ;
    cfg.timeout_ms = 1000;
    cfg.data_size = 1;
    cfg.task_stack_size = 4096;

    esp_ping_callbacks_t cbs = { 0 };
    esp_ping_handle_t ping;
    ESP_ERROR_CHECK(esp_ping_new_session(&cfg, &cbs, &ping));
    ESP_ERROR_CHECK(esp_ping_start(ping));
    ESP_LOGI(TAG, "Pinging 192.168.4.1 at %d Hz", PING_RATE_HZ);
}

static void event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_CONNECTED) {
        wifi_event_sta_connected_t *e = (wifi_event_sta_connected_t *)data;
        memcpy(s_ap_bssid, e->bssid, 6);
        ESP_LOGI(TAG, "Connected to %s on channel %d", AP_SSID, e->channel);
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Disconnected, retrying...");
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "Got IP, starting CSI capture");
        if (!s_csi_started) {
            start_csi();
            start_ping();
            s_csi_started = true;
        }
    }
}

void app_main(void)
{
    // Switch serial to 921600 baud. 115200 is too slow for 100 CSI frames/s.
    // The boot messages before this line still appear at 115200 (garbled, that's fine).
    fflush(stdout);
    vTaskDelay(pdMS_TO_TICKS(50));
    uart_set_baudrate(UART_NUM_0, 921600);

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    s_csi_queue = xQueueCreate(32, sizeof(csi_frame_t));
    xTaskCreate(csi_print_task, "csi_print", 4096, NULL, 5, NULL);

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &event_handler, NULL));

    wifi_config_t sta_cfg = {
        .sta = {
            .ssid = AP_SSID,
            .password = AP_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
    ESP_ERROR_CHECK(esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N));
    esp_wifi_set_bandwidth(WIFI_IF_STA, (wifi_bandwidth_t)1);   // 1 = 20 MHz (name differs across IDF versions)
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(10000));
        if (s_dropped) {
            ESP_LOGW(TAG, "%lu CSI frames dropped (serial too slow)", (unsigned long)s_dropped);
            s_dropped = 0;
        }
    }
}
