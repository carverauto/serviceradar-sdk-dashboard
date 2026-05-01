package srdashboard

import "bytes"

// FrameEncoding identifies the host transport used for a data frame.
type FrameEncoding uint32

const (
	FrameEncodingJSONRows FrameEncoding = 0
	FrameEncodingArrowIPC FrameEncoding = 1
)

// String returns the manifest/API name for the frame encoding.
func (encoding FrameEncoding) String() string {
	switch encoding {
	case FrameEncodingJSONRows:
		return "json_rows"
	case FrameEncodingArrowIPC:
		return "arrow_ipc"
	default:
		return "unknown"
	}
}

// LooksLikeArrowIPC returns true when payload has the Arrow IPC file magic.
//
// ServiceRadar's initial Arrow encoder emits Arrow IPC files, which carry the
// ARROW1 magic at both the start and end of the payload. Future stream encoders
// may not have this marker, so this helper is a diagnostic guard, not a full
// parser.
func LooksLikeArrowIPC(payload []byte) bool {
	return bytes.HasPrefix(payload, []byte("ARROW1")) || bytes.HasSuffix(payload, []byte("ARROW1"))
}
