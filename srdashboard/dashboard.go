//go:build tinygo

package srdashboard

import "unsafe"

//go:wasmimport serviceradar emit_render_model
func emitRenderModel(ptr uint32, size uint32) int32

const heapSize = 64 * 1024

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
