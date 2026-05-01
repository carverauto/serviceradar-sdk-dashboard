package srdashboard

import "testing"

func TestFrameEncodingString(t *testing.T) {
	tests := []struct {
		name     string
		encoding FrameEncoding
		want     string
	}{
		{name: "json rows", encoding: FrameEncodingJSONRows, want: "json_rows"},
		{name: "arrow ipc", encoding: FrameEncodingArrowIPC, want: "arrow_ipc"},
		{name: "unknown", encoding: FrameEncoding(99), want: "unknown"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.encoding.String(); got != test.want {
				t.Fatalf("String() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestLooksLikeArrowIPC(t *testing.T) {
	tests := []struct {
		name    string
		payload []byte
		want    bool
	}{
		{name: "file prefix", payload: []byte("ARROW1payload"), want: true},
		{name: "file suffix", payload: []byte("payloadARROW1"), want: true},
		{name: "empty", payload: nil, want: false},
		{name: "json", payload: []byte(`{"results":[]}`), want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := LooksLikeArrowIPC(test.payload); got != test.want {
				t.Fatalf("LooksLikeArrowIPC() = %v, want %v", got, test.want)
			}
		})
	}
}
