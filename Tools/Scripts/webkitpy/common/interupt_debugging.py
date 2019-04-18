# Copyright (C) 2017 Apple Inc. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions
# are met:
# 1.  Redistributions of source code must retain the above copyright
#     notice, this list of conditions and the following disclaimer.
# 2.  Redistributions in binary form must reproduce the above copyright
#     notice, this list of conditions and the following disclaimer in the
#     documentation and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS'' AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import linecache
import logging
import signal
import sys

_log = logging.getLogger(__name__)


def log_stack_trace(frame, file):
    file.write('Traceback(most recent call last):\n')

    def func(frame):
        if not frame:
            return
        func(frame.f_back)
        file.write('  File "{}", line {}, in {}\n'.format(frame.f_code.co_filename, frame.f_lineno, frame.f_code.co_name))
        file.write('    {}\n'.format(linecache.getline(frame.f_code.co_filename, frame.f_lineno).lstrip().rstrip()))

    func(frame)


def log_stack_trace_on_term(output_file=None):
    def handler(signum, frame):
        file = open(output_file, 'w') if output_file else sys.stderr
        if not file:
            raise RuntimeError('{} cannot be opened'.format(output_file))

        if file is sys.stderr:
            file.write('\n')
        else:
            _log.critical('Stack trace saved to {}'.format(output_file))
        file.write('SIGTERM signal received')
        log_stack_trace(frame, file)
        exit(-1)

    signal.signal(signal.SIGTERM, handler)


def log_stack_trace_on_cntrl_c(output_file=None):
    def handler(signum, frame):
        file = open(output_file, 'w') if output_file else sys.stderr
        if not file:
            raise RuntimeError('{} cannot be opened'.format(output_file))

        if file is sys.stderr:
            file.write('\n')
        else:
            _log.critical('Stack trace saved to {}'.format(output_file))
        file.write('cntrl C received\n')
        log_stack_trace(frame, file)
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handler)
