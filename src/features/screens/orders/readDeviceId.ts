/** The companion's own machine id, which it appends to the kiosk URL as `?deviceId=` — `null` anywhere else (admin previews, a plain browser tab), which keeps the order board and the register read-only there. Deliberately not `displayMachineId`: `ScreenDisplay` treats that param as an assignment redirect. */
export function readDeviceId(): string | null {
  return new URLSearchParams(window.location.search).get('deviceId')
}
