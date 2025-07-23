package main

import (
	"go_general_agent/cmd"
	"go_general_agent/internal/logging"
)

func main() {
	defer logging.RecoverPanic("main", func() {
		logging.Error("Application terminated due to unhandled panic")
	})

	cmd.Execute()
}
