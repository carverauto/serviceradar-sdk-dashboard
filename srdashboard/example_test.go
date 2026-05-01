package srdashboard_test

import (
	"fmt"

	"code.carverauto.dev/carverauto/serviceradar-sdk-dashboard/srdashboard"
)

func ExampleLooksLikeArrowIPC() {
	payload := []byte("ARROW1...")
	fmt.Println(srdashboard.LooksLikeArrowIPC(payload))
	// Output: true
}
