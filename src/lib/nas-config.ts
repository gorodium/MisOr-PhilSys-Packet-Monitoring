// NAS connection constants, ported from PAMANA Utility config.py
export const NAS_SFTP_PORT = 2222;
export const NAS_DESTINATION_ROOT = "/Misamis Oriental/ePhilID TRN Concerns";

// Search order: NAS2 (upload2 / old IP) first, then NAS1 (primary)
export const NAS_SEARCH_HOSTS = [
  { name: "NAS2 (Old)", host: "172.16.35.100", port: NAS_SFTP_PORT },
  { name: "NAS1 (Primary)", host: "upload.philsys.gov.ph", port: NAS_SFTP_PORT },
];

// The destination NAS is always NAS1 (primary)
export const NAS_DESTINATION_HOST = { name: "NAS1 (Primary)", host: "upload.philsys.gov.ph", port: NAS_SFTP_PORT };
