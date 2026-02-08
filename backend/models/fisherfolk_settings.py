"""Compatibility shim for old module name.

This file used to declare `FisherfolkSettings`. The model was renamed to
`Fisherfolk` and moved to `models.fisherfolk`. Import the new class and
re-export it under the old name for backward compatibility.
"""

from models.fisherfolk import Fisherfolk as FisherfolkSettings
