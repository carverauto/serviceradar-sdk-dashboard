//go:build tinygo

package srdashboard

import "unsafe"

//go:wasmimport serviceradar emit_render_model
func emitRenderModel(ptr uint32, size uint32) int32

//go:wasmimport serviceradar frame_bytes_len
func frameBytesLen(index uint32) uint32

//go:wasmimport serviceradar frame_bytes_write
func frameBytesWrite(index uint32, ptr uint32, size uint32) uint32

//go:wasmimport serviceradar frame_encoding
func frameEncoding(index uint32) uint32

const heapSize = 8 * 1024 * 1024

var heap [heapSize]byte
var heapOffset uint32

// AllocBytes allocates linear-memory space for host-to-renderer payloads.
func AllocBytes(size uint32) uint32 {
	if heapOffset+size > heapSize {
		return 0
	}

	ptr := uint32(uintptr(unsafe.Pointer(&heap[heapOffset])))
	heapOffset += (size + 7) &^ 7

	return ptr
}

// FreeBytes is currently a no-op because the v1 host sends one init payload.
func FreeBytes(_ptr uint32, _size uint32) {}

// EmitRenderModelJSON sends a ServiceRadar render model to the dashboard host.
func EmitRenderModelJSON(renderModel []byte) {
	if len(renderModel) == 0 {
		return
	}

	emitRenderModel(uint32(uintptr(unsafe.Pointer(&renderModel[0]))), uint32(len(renderModel)))
}

// DataFrameEncoding returns the transport encoding for a host data frame.
func DataFrameEncoding(index uint32) FrameEncoding {
	return FrameEncoding(frameEncoding(index))
}

// DataFrameBytes copies the raw frame payload out of the ServiceRadar host.
// For Arrow IPC frames this returns the IPC stream bytes. JSON-row frames return
// an empty slice; use the JSON init payload for those small frames.
func DataFrameBytes(index uint32) []byte {
	size := frameBytesLen(index)
	if size == 0 {
		return nil
	}

	buf := make([]byte, size)
	written := frameBytesWrite(index, uint32(uintptr(unsafe.Pointer(&buf[0]))), size)
	if written < size {
		return buf[:written]
	}

	return buf
}
