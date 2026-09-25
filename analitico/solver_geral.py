"""Solução analítica geral 2D: cabo inextensível com trechos de pesos diferentes e forças
verticais concentradas (mesmo método do visualizador, analitico_solver.js).

Reproduz os Códigos 1, 3 e 4 como casos particulares:
    Analitico(A, B, [(L, q)], [])                      -> Código 1
    Analitico(A, B, [(L1, q1), (L2, q2)], [])          -> Código 3
    Analitico(A, B, [(L, q)], [(zeta, P)])             -> Código 4
Incógnitas: H (= T0, tração horizontal) e V_A (componente vertical da tração em A).
"""
import numpy as np
from scipy.optimize import fsolve


class Analitico:
    """Cabo inextensível com peso por trecho e forças verticais concentradas.
    Ao longo do arco, V(s) = V_A + (peso acumulado) + (forças já passadas) e
    dx/ds = H/sqrt(H²+V²), dy/ds = V/sqrt(H²+V²), integrados exatamente por trecho."""

    def __init__(self, A, B, trechos, forcas):
        self.A = np.array(A, float)
        self.Lt = sum(l for l, _ in trechos)
        fronteiras = np.cumsum([0] + [l for l, _ in trechos])
        self.fs = [(f * self.Lt, P) for f, P in forcas]
        self.cortes = sorted(set(fronteiras) | {s for s, _ in self.fs})
        self.q_trechos = [(fronteiras[i], fronteiras[i + 1], q) for i, (_, q) in enumerate(trechos)]
        dx, dy = B[0] - A[0], B[1] - A[1]
        W = sum(l * q for l, q in trechos) + sum(P for _, P in forcas)
        f = lambda v: np.array(self._fim(*v)) - [dx, dy]
        sol, _, ier, msg = fsolve(f, [W / 2, -W / 2], full_output=True, xtol=1e-13)
        assert ier == 1 and np.abs(f(sol)).max() < 1e-8 and sol[0] > 0, msg
        self.H, self.VA = sol

    def _q(self, s):
        return next(q for a, b, q in self.q_trechos if a - 1e-12 <= s < b - 1e-12 or b == self.Lt)

    def _pedacos(self, H, VA):
        """(s0, s1, q, V em s0) para cada pedaço entre cortes"""
        V, out = VA, []
        for a, b in zip(self.cortes[:-1], self.cortes[1:]):
            V += sum(P for s, P in self.fs if abs(s - a) < 1e-9)
            q = self._q((a + b) / 2)
            out.append((a, b, q, V))
            V += q * (b - a)
        return out

    @staticmethod
    def _dxy(H, V0, q, ds):
        V1 = V0 + q * ds
        return H / q * (np.arcsinh(V1 / H) - np.arcsinh(V0 / H)), (np.hypot(H, V1) - np.hypot(H, V0)) / q

    def _fim(self, H, VA):
        x = y = 0.0
        for a, b, q, V in self._pedacos(H, VA):
            dx, dy = self._dxy(H, V, q, b - a)
            x, y = x + dx, y + dy
        return x, y

    def ponto(self, s):
        """posição, V e tração no arco s (lado de s crescente)"""
        x = y = 0.0
        for a, b, q, V in self._pedacos(self.H, self.VA):
            if s <= b + 1e-12:
                dx, dy = self._dxy(self.H, V, q, s - a)
                Vs = V + q * (s - a)
                return self.A + [x + dx, y + dy], Vs, np.hypot(self.H, Vs)
            dx, dy = self._dxy(self.H, V, q, b - a)
            x, y = x + dx, y + dy

    def curva(self, n=4000):
        s = np.unique(np.concatenate([np.linspace(0, self.Lt, n), self.cortes]))
        return s, np.array([self.ponto(si)[0] for si in s])

    def mais_baixo(self):
        s, xy = self.curva()
        i = int(np.argmin(xy[:, 1]))
        return xy[i]
