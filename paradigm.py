#!/usr/bin/python3
"""Start Paradigm: run this file (or double-click it) to open the app in your browser.

The #! line is read by the Windows py launcher on double-click: "/usr/bin/python3"
means "the installed Python 3" there. "/usr/bin/env python3" would search PATH and could
hit the Microsoft Store stub instead.
"""
import sys

from paradigm.app import main

if __name__ == "__main__":
    sys.exit(main())
