package srdashboard

import "testing"

func TestBuildSRQL(t *testing.T) {
	got := BuildSRQL(SRQLQuery{
		Entity:      "wifi_sites",
		SearchField: "site_code",
		Search:      "AM East",
		Exclude: map[string][]string{
			"region":      {"AM-East"},
			"ap_family":   {"6xx", "7xx"},
			"wlc_model":   {"7030"},
			"aos_version": nil,
		},
		Where: []string{"down_count:>0"},
		Limit: 500,
	})

	want := `in:wifi_sites site_code:%AM\ East% !ap_family:(6xx,7xx) !region:(AM-East) !wlc_model:(7030) down_count:>0 limit:500`
	if got != want {
		t.Fatalf("BuildSRQL() = %q, want %q", got, want)
	}
}

func TestEscapeSRQLValue(t *testing.T) {
	if got := EscapeSRQLValue("  AM   East  "); got != `AM\ East` {
		t.Fatalf("EscapeSRQLValue() = %q", got)
	}
}
