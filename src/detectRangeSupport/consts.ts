/** Give a slow server this long to answer the range probe before assuming no range support */
export const RANGE_PROBE_TIMEOUT_MS = 5_000;

/** A one-byte range, the cheapest request that reveals whether the server honors ranges */
export const FIRST_BYTE_RANGE = 'bytes=0-0';

/** HTTP 206, the status a range-honoring server answers the probe with */
export const HTTP_PARTIAL_CONTENT = 206;
