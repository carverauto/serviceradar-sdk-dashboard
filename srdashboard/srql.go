package srdashboard

import (
	"sort"
	"strconv"
	"strings"
)

// SRQLQuery describes a simple key:value SRQL query for dashboard interactions.
type SRQLQuery struct {
	Entity      string
	SearchField string
	Search      string
	Include     map[string][]string
	Exclude     map[string][]string
	Where       []string
	Limit       int
}

// BuildSRQL builds a deterministic SRQL query string for dashboard packages.
func BuildSRQL(query SRQLQuery) string {
	entity := strings.TrimSpace(query.Entity)
	if entity == "" {
		entity = "devices"
	}

	tokens := []string{"in:" + entity}

	if search := strings.TrimSpace(query.Search); search != "" && strings.TrimSpace(query.SearchField) != "" {
		tokens = append(tokens, strings.TrimSpace(query.SearchField)+":%"+EscapeSRQLValue(search)+"%")
	}

	tokens = appendFilters(tokens, query.Include, "")
	tokens = appendFilters(tokens, query.Exclude, "!")

	for _, clause := range query.Where {
		if text := strings.TrimSpace(clause); text != "" {
			tokens = append(tokens, text)
		}
	}

	if query.Limit > 0 {
		tokens = append(tokens, "limit:"+strconv.Itoa(query.Limit))
	}

	return strings.Join(tokens, " ")
}

// EscapeSRQLValue escapes whitespace in a single SRQL value token.
func EscapeSRQLValue(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), `\ `)
}

// SRQLList builds a parenthesized SRQL list from values.
func SRQLList(values []string) string {
	escaped := make([]string, 0, len(values))
	for _, value := range values {
		if text := EscapeSRQLValue(value); text != "" {
			escaped = append(escaped, text)
		}
	}

	return "(" + strings.Join(escaped, ",") + ")"
}

func appendFilters(tokens []string, filters map[string][]string, prefix string) []string {
	keys := make([]string, 0, len(filters))
	for key := range filters {
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	for _, key := range keys {
		values := compactValues(filters[key])
		if len(values) == 0 {
			continue
		}

		tokens = append(tokens, prefix+strings.TrimSpace(key)+":"+SRQLList(values))
	}

	return tokens
}

func compactValues(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if text := strings.TrimSpace(value); text != "" {
			out = append(out, text)
		}
	}
	sort.Strings(out)

	return out
}
