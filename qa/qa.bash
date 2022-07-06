#!/usr/bin/env bash
build_n_run() {
    docker compose -f $1  --project-directory . build
    docker compose -f $1  --project-directory . up --exit-code-from runner
}
if [ $# -eq 0 ]
then
    echo ">>> Starting full QA testing <<<"
    
    npm run lint

    echo ">>> TODO: finish TypeScript refactor and pass the linter"
    npx vitest run || exit 1
    if [ $? -ne 0 ]
    then
        echo ">>> unit tests FAILED"
        exit 2
    fi
    npx vite build
    if [ $? -ne 0 ]
    then
        echo ">>> unit tests FAILED"
        exit 3
    fi
    for compose in `find qa -name "lab.yaml"`
    do
        dir=$(dirname $compose)
        echo ">>> bringing up a lab from $dir"
        build_n_run $compose
        if [ $? -ne 0 ]
        then
            echo ">>> $dir tests FAILED"
             exit 4
        fi
    done
else
    npx vite build
    for arg in $@
    do
        echo ">>> setting up a lab from $arg"
        build_n_run $arg/lab.yaml
        if [ $? -ne 0 ]
        then
             echo ">>> $arg FAILED"
             exit 4
        fi
        echo ">>> $arg tests PASSED"
    done
fi
