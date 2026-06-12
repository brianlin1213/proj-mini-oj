TARGET = main
INPUT = input.txt
OUTPUT = output.txt
ANSWER = answer.txt

C_SRC = $(wildcard main.c)
CPP_SRC = $(wildcard main.cpp)

ifneq ($(C_SRC),)
SRC = main.c
COMPILER = gcc
FLAGS = -std=c11 -Wall -Wextra
else ifneq ($(CPP_SRC),)
SRC = main.cpp
COMPILER = g++
FLAGS = -std=c++17 -Wall -Wextra
else
$(error No main.c or main.cpp found)
endif

all: $(TARGET)

$(TARGET): $(SRC)
	$(COMPILER) $(FLAGS) $(SRC) -o $(TARGET)

run: $(TARGET)
	./$(TARGET)

test: $(TARGET)
	./$(TARGET) < $(INPUT) > $(OUTPUT)
	@echo "====== Program Output ======"
	@cat $(OUTPUT)

check: test
	@echo ""
	@echo "====== Compare Result ======"
	@if [ ! -s $(ANSWER) ]; then \
		echo "[NO ANSWER] No answer.txt provided, only showing program output."; \
	elif diff -u $(OUTPUT) $(ANSWER) > diff_result.txt; then \
		echo "[AC] Accepted"; \
	else \
		echo "[WA] Wrong Answer"; \
		cat diff_result.txt; \
	fi

clean:
	rm -f $(TARGET) $(OUTPUT) diff_result.txt

.PHONY: all run test check clean