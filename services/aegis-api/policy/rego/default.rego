package aegis

import future.keywords.if
import future.keywords.in

# input: { tool_name, rules: [{ tool_pattern, decision, priority }] }
# Precedence: deny > allow_with_obligation > allow

default decision := "allow"

decision := "deny" if {
	some rule in input.rules
	rule.decision == "deny"
	tool_matches(rule.tool_pattern, input.tool_name)
}

decision := "allow_with_obligation" if {
	not deny_applies
	some rule in input.rules
	rule.decision == "allow_with_obligation"
	tool_matches(rule.tool_pattern, input.tool_name)
}

decision := "allow" if {
	not deny_applies
	not obligation_applies
	some rule in input.rules
	rule.decision == "allow"
	tool_matches(rule.tool_pattern, input.tool_name)
}

deny_applies if {
	some rule in input.rules
	rule.decision == "deny"
	tool_matches(rule.tool_pattern, input.tool_name)
}

obligation_applies if {
	some rule in input.rules
	rule.decision == "allow_with_obligation"
	tool_matches(rule.tool_pattern, input.tool_name)
}

tool_matches(pattern, tool) if {
	pattern == tool
}

tool_matches(pattern, tool) if {
	glob.match(pattern, ["."], tool, true)
}
