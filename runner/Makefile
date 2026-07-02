TARGET = main
INPUT = input.txt
OUTPUT = output.txt
ANSWER = answer.txt

C_SRC = $(wildcard main.c)
CPP_SRC = $(wildcard main.cpp)
PY_SRC = $(wildcard main.py)

ifneq ($(C_SRC),)
SRC = main.c
COMPILER = gcc
FLAGS = -std=c11 -Wall -Wextra
RUN_CMD = ./$(TARGET)
else ifneq ($(CPP_SRC),)
SRC = main.cpp
COMPILER = g++
FLAGS = -std=c++17 -Wall -Wextra
RUN_CMD = ./$(TARGET)
else ifneq ($(PY_SRC),)
SRC = main.py
RUN_CMD = python3 $(SRC)
else
$(error No main.c, main.cpp, or main.py found)
endif

all: $(TARGET)

ifneq ($(PY_SRC),)
$(TARGET): $(SRC)
	@echo "Python source detected, no compile step needed."
else
$(TARGET): $(SRC)
	$(COMPILER) $(FLAGS) $(SRC) -o $(TARGET)
endif

run: $(TARGET)
	$(RUN_CMD)

test: $(TARGET)
	$(RUN_CMD) < $(INPUT) > $(OUTPUT)
	@echo "====== Program Output ======"
	@cat $(OUTPUT)

check: test
	@echo ""
	@echo "====== Compare Result ======"
	@if [ ! -s $(ANSWER) ]; then \
		echo "[NO ANSWER] No answer.txt provided, only showing program output."; \
	else \
		awk '{ sub(/[[:space:]]+$$/, ""); lines[NR]=$$0 } END { n=NR; while (n>0 && lines[n]=="") n--; for (i=1; i<=n; i++) print lines[i] }' $(OUTPUT) > output_norm.txt; \
		awk '{ sub(/[[:space:]]+$$/, ""); lines[NR]=$$0 } END { n=NR; while (n>0 && lines[n]=="") n--; for (i=1; i<=n; i++) print lines[i] }' $(ANSWER) > answer_norm.txt; \
		if diff -u output_norm.txt answer_norm.txt > diff_result.txt; then \
			echo "[AC] Accepted"; \
		else \
			echo "[WA] Wrong Answer"; \
			cat diff_result.txt; \
		fi \
	fi

clean:
	rm -f $(TARGET) $(OUTPUT) diff_result.txt output_norm.txt answer_norm.txt

.PHONY: all run test check clean
